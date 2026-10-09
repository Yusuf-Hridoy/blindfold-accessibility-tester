// Runs the Blindfold CLI from source with Node (no shell), as `npm run blindfold` does.

import { spawn } from "node:child_process";
import path from "node:path";

export const CLI_PATH = path.join(import.meta.dirname, "..", "..", "src", "cli", "blindfold-cli.ts");

export interface CliRun {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Runs any command and collects its output. */
export function runCommand(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<CliRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

export function runBlindfoldCli(args: string[], env?: NodeJS.ProcessEnv): Promise<CliRun> {
  return runCommand(process.execPath, ["--import", "tsx", CLI_PATH, ...args], env ? { env } : {});
}
