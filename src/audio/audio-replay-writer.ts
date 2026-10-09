// Writes blindfold-audio.wav: speaks each segment with espeak-ng (each
// distinct phrase once), adds ticks, pauses and silences, and joins it all.
// Audio never fails a run: any problem becomes a "skipped" result with a reason.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EspeakNotFoundError, FALLBACK_VOICE, startEspeakSpeaker, type EspeakSpeaker } from "./espeak-ng-speaker.ts";
import type { AudioSegment } from "./transcript-to-audio.ts";
import {
  concatenate,
  createSilence,
  createTick,
  durationSeconds,
  encodeWav,
  parseWav,
  REPLAY_SAMPLE_RATE,
  resample,
  WavFormatError,
} from "./wav-audio-builder.ts";

export const AUDIO_FILE_NAME = "blindfold-audio.wav";
export const ESPEAK_MISSING_REASON = "espeak-ng not found. Install it (macOS: brew install espeak-ng) or use --no-audio.";
const PARALLEL_UTTERANCES = 4;

export type AudioReplayResult =
  | { status: "written"; filePath: string; fileName: string; durationSeconds: number; sizeBytes: number; notes: string[] }
  | { status: "skipped"; reason: string };

/** Picks a voice per language, with a note for each language that falls back to English. */
function chooseVoices(speaker: EspeakSpeaker, segments: AudioSegment[]): { voices: Map<string, string>; notes: string[] } {
  const voices = new Map<string, string>();
  const notes: string[] = [];
  for (const segment of segments) {
    if (segment.kind !== "speech" || voices.has(segment.language)) continue;
    const voice = speaker.voiceFor(segment.language);
    voices.set(segment.language, voice ?? FALLBACK_VOICE);
    if (voice) continue;
    notes.push(
      segment.language
        ? `The page language "${segment.language}" has no espeak-ng voice, so the English voice was used.`
        : "The page has no lang attribute, so the English voice was used.",
    );
  }
  return { voices, notes };
}

async function synthesizeAll(speaker: EspeakSpeaker, utterances: { key: string; text: string; voice: string }[], folder: string): Promise<Map<string, Int16Array>> {
  const audioByKey = new Map<string, Int16Array>();
  let next = 0;
  async function worker(): Promise<void> {
    while (next < utterances.length) {
      const index = next++;
      const utterance = utterances[index];
      if (!utterance) continue;
      const file = path.join(folder, `utterance-${index}.wav`);
      await speaker.speak(utterance.text, utterance.voice, file);
      audioByKey.set(utterance.key, resample(parseWav(await readFile(file)), REPLAY_SAMPLE_RATE));
    }
  }
  await Promise.all(Array.from({ length: PARALLEL_UTTERANCES }, worker));
  return audioByKey;
}

export async function writeAudioReplay(segments: AudioSegment[], outputFolder: string, espeakCommand?: string): Promise<AudioReplayResult> {
  let speaker: EspeakSpeaker;
  try {
    speaker = await startEspeakSpeaker(espeakCommand);
  } catch (error) {
    if (error instanceof EspeakNotFoundError) return { status: "skipped", reason: ESPEAK_MISSING_REASON };
    return { status: "skipped", reason: `espeak-ng didn't run (${error instanceof Error ? error.message : String(error)}).` };
  }

  const { voices, notes } = chooseVoices(speaker, segments);
  const keyFor = (text: string, voice: string) => `${voice}\n${text}`;
  const utterances = new Map<string, { key: string; text: string; voice: string }>();
  for (const segment of segments) {
    if (segment.kind !== "speech") continue;
    const voice = voices.get(segment.language) ?? FALLBACK_VOICE;
    const key = keyFor(segment.text, voice);
    utterances.set(key, { key, text: segment.text, voice });
  }

  const temporaryFolder = await mkdtemp(path.join(os.tmpdir(), "blindfold-audio-"));
  try {
    const spoken = await synthesizeAll(speaker, [...utterances.values()], temporaryFolder);
    const tick = createTick(REPLAY_SAMPLE_RATE);
    const parts = segments.map((segment) => {
      if (segment.kind === "tick") return tick;
      if (segment.kind === "speech") return spoken.get(keyFor(segment.text, voices.get(segment.language) ?? FALLBACK_VOICE)) ?? new Int16Array(0);
      return createSilence(REPLAY_SAMPLE_RATE, segment.milliseconds);
    });
    const audio = { sampleRate: REPLAY_SAMPLE_RATE, samples: concatenate(parts) };
    const bytes = encodeWav(audio);
    const filePath = path.join(outputFolder, AUDIO_FILE_NAME);
    await writeFile(filePath, bytes);
    return { status: "written", filePath, fileName: AUDIO_FILE_NAME, durationSeconds: durationSeconds(audio), sizeBytes: bytes.byteLength, notes };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = error instanceof WavFormatError ? `espeak-ng wrote audio Blindfold can't read (${message}).` : `the audio couldn't be built (${message}).`;
    return { status: "skipped", reason };
  } finally {
    await rm(temporaryFolder, { recursive: true, force: true });
  }
}
