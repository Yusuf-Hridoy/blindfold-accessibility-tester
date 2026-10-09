// Speaks text with espeak-ng, an optional free system program (not an npm
// package): one child process per utterance, each writing a WAV file.

import { spawn } from "node:child_process";

export const ESPEAK_COMMAND = "espeak-ng";
const WORDS_PER_MINUTE = 175;
const COMMAND_TIMEOUT_MILLISECONDS = 10_000;
export const FALLBACK_VOICE = "en";

/** espeak-ng isn't installed (or isn't on the PATH). */
export class EspeakNotFoundError extends Error {}

export interface EspeakSpeaker {
  /** The voice for a page's lang attribute, e.g. "de" for "de-AT"; null when espeak-ng has none. */
  voiceFor(language: string): string | null;
  /** Writes `text`, spoken with `voice`, to a WAV file. */
  speak(text: string, voice: string, outputFile: string): Promise<void>;
}

/** Runs a command, feeding `input` on stdin, and returns its stdout. */
function runCommand(command: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} didn't finish within ${COMMAND_TIMEOUT_MILLISECONDS / 1000} seconds`));
    }, COMMAND_TIMEOUT_MILLISECONDS);
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(error.code === "ENOENT" ? new EspeakNotFoundError(`${command} not found`) : error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited with code ${code}${stderr.trim() ? `: ${stderr.trim().split("\n")[0]}` : ""}`));
    });
    child.stdin.on("error", () => {
      // The process may exit before reading everything; its exit code tells what happened.
    });
    child.stdin.end(input ?? "");
  });
}

/** The language codes in `espeak-ng --voices` output (second column), lowercased. */
export function parseVoiceList(output: string): Set<string> {
  const languages = new Set<string>();
  for (const line of output.split("\n").slice(1)) {
    const language = line.trim().split(/\s+/)[1];
    if (language) languages.add(language.toLowerCase());
  }
  return languages;
}

/** Exact tag, then the primary language, then any regional voice of it (e.g. "fr" → "fr-fr"). */
export function chooseVoice(language: string, voices: Set<string>): string | null {
  const tag = language.trim().toLowerCase().replace(/_/g, "-");
  if (tag === "") return null;
  if (voices.has(tag)) return tag;
  const primary = tag.split("-")[0] ?? tag;
  if (voices.has(primary)) return primary;
  return [...voices].find((voice) => voice.startsWith(`${primary}-`)) ?? null;
}

/** Checks espeak-ng runs and reads its voice list once. Throws EspeakNotFoundError when it's missing. */
export async function startEspeakSpeaker(command = ESPEAK_COMMAND): Promise<EspeakSpeaker> {
  const voices = parseVoiceList(await runCommand(command, ["--voices"]));
  return {
    voiceFor: (language) => chooseVoice(language, voices),
    async speak(text, voice, outputFile) {
      // Text goes in on stdin, so nothing in it can be read as an option.
      await runCommand(command, ["-v", voice, "-s", String(WORDS_PER_MINUTE), "-w", outputFile, "--stdin"], text);
    },
  };
}
