// Reads a session file saved by `blindfold login` (Playwright storage state:
// cookies plus each origin's localStorage) and checks its shape.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserContextOptions } from "playwright";

/** The storage state object Playwright loads into a new browser context. */
export type SessionState = Exclude<BrowserContextOptions["storageState"], string | undefined>;

/** The session file is missing or isn't a saved session. Exit code 2. */
export class SessionFileError extends Error {}

export const SESSION_FILE_SUFFIX = ".session.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCookie(value: unknown): boolean {
  return isRecord(value) && ["name", "value", "domain", "path"].every((field) => typeof value[field] === "string");
}

function isOriginStorage(value: unknown): boolean {
  return isRecord(value) && typeof value.origin === "string" && Array.isArray(value.localStorage);
}

/** Checks parsed JSON is a storage state; returns what's wrong, or null when it's fine. */
export function findSessionProblem(content: unknown): string | null {
  if (!isRecord(content)) return "it isn't a JSON object";
  if (!Array.isArray(content.cookies)) return 'it has no "cookies" list';
  if (!Array.isArray(content.origins)) return 'it has no "origins" list';
  if (!content.cookies.every(isCookie)) return "one of its cookies is missing a name, value, domain or path";
  if (!content.origins.every(isOriginStorage)) return 'one of its "origins" entries is missing "origin" or "localStorage"';
  return null;
}

export async function loadSessionFile(filePath: string): Promise<SessionState> {
  const absolutePath = path.resolve(filePath);
  let text: string;
  try {
    text = await readFile(absolutePath, "utf8");
  } catch {
    throw new SessionFileError(
      `Session file not found: ${absolutePath}. Create one with: npm run blindfold -- login <url> --save-session ${path.basename(filePath)}`,
    );
  }
  let content: unknown;
  try {
    content = JSON.parse(text);
  } catch {
    throw new SessionFileError(`Session file ${absolutePath} isn't valid JSON. Save it again with "blindfold login".`);
  }
  const problem = findSessionProblem(content);
  if (problem) {
    throw new SessionFileError(`Session file ${absolutePath} isn't a saved session (${problem}). Save it again with "blindfold login".`);
  }
  return content as SessionState;
}
