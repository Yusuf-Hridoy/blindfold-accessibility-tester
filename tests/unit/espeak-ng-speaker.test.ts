// espeak-ng is optional for users. The pure parts always run; the parts that
// call espeak-ng are skipped when it's missing, except in CI, where the
// workflow installs it and a missing espeak-ng must fail these tests.

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ESPEAK_MISSING_REASON, writeAudioReplay } from "../../src/audio/audio-replay-writer.ts";
import { chooseVoice, parseVoiceList, startEspeakSpeaker } from "../../src/audio/espeak-ng-speaker.ts";
import type { AudioSegment } from "../../src/audio/transcript-to-audio.ts";
import { parseWav, REPLAY_SAMPLE_RATE } from "../../src/audio/wav-audio-builder.ts";

const espeakInstalled = spawnSync("espeak-ng", ["--version"]).status === 0;
const runEspeakTests = espeakInstalled || Boolean(process.env.CI);

const VOICES_OUTPUT = `Pty Language       Age/Gender VoiceName          File                 Other Languages
 5  de              --/M      German             gmw/de
 5  en-gb           --/M      English_(Great_Britain) gmw/en           (en 2)
 2  en-us           --/M      English_(America)  gmw/en-US            (en 3)
 5  fr-fr           --/M      French_(France)    roa/fr               (fr 5)
`;

describe("choosing a voice from the page language", () => {
  const voices = parseVoiceList(VOICES_OUTPUT);

  it("reads the language column of espeak-ng --voices", () => {
    expect([...voices]).toEqual(["de", "en-gb", "en-us", "fr-fr"]);
  });

  it("prefers the exact tag, then the language, then a regional voice", () => {
    expect(chooseVoice("en-US", voices)).toBe("en-us");
    expect(chooseVoice("de-AT", voices)).toBe("de");
    expect(chooseVoice("fr", voices)).toBe("fr-fr");
    expect(chooseVoice("en_GB", voices)).toBe("en-gb");
  });

  it("has no voice for unknown languages or a missing lang attribute", () => {
    expect(chooseVoice("xx", voices)).toBeNull();
    expect(chooseVoice("", voices)).toBeNull();
  });
});

describe("when espeak-ng is missing", () => {
  it("skips the audio with the install hint, and doesn't throw", async () => {
    const result = await writeAudioReplay([{ kind: "tick" }], os.tmpdir(), "blindfold-test-no-such-espeak-ng");
    expect(result).toEqual({ status: "skipped", reason: ESPEAK_MISSING_REASON });
    expect(ESPEAK_MISSING_REASON).toBe("espeak-ng not found. Install it (macOS: brew install espeak-ng) or use --no-audio.");
  });
});

describe.skipIf(!runEspeakTests)("with espeak-ng installed", () => {
  let folder: string;
  beforeAll(async () => {
    folder = await mkdtemp(path.join(os.tmpdir(), "blindfold-espeak-test-"));
  });
  afterAll(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it("is installed (CI installs it, so this fails there if it's missing)", () => {
    expect(espeakInstalled).toBe(true);
  });

  it("speaks a phrase into a 22050 Hz 16-bit mono WAV", async () => {
    const speaker = await startEspeakSpeaker();
    expect(speaker.voiceFor("en-US")).not.toBeNull();
    const file = path.join(folder, "phrase.wav");
    await speaker.speak("button, Add to cart", "en", file);
    const audio = parseWav(await readFile(file));
    expect(audio.sampleRate).toBe(REPLAY_SAMPLE_RATE);
    expect(audio.samples.length / audio.sampleRate).toBeGreaterThan(0.5);
  });

  it("writes one replay file with the speech, ticks and silences, and notes voice fallbacks", async () => {
    const segments: AudioSegment[] = [
      { kind: "speech", text: "Start page: Pebble and Pine", language: "en" },
      { kind: "tick" },
      { kind: "pause", milliseconds: 120 },
      { kind: "silence", milliseconds: 1_500, reason: "never announced" },
      { kind: "speech", text: "Hello", language: "xx" },
      { kind: "speech", text: "Hello again", language: "" },
    ];
    const result = await writeAudioReplay(segments, folder);
    if (result.status !== "written") throw new Error(`audio was skipped: ${result.reason}`);
    const audio = parseWav(await readFile(result.filePath));
    expect(result.fileName).toBe("blindfold-audio.wav");
    expect(result.sizeBytes).toBe(44 + audio.samples.length * 2);
    // At least the tick, pause and silence, plus three phrases of speech.
    expect(result.durationSeconds).toBeGreaterThan(1.65 + 1);
    expect(result.notes).toEqual([
      'The page language "xx" has no espeak-ng voice, so the English voice was used.',
      "The page has no lang attribute, so the English voice was used.",
    ]);
  });
});
