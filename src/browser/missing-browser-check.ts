// Turns Playwright's "Executable doesn't exist" launch error into one clear
// line. The install command names Blindfold's own Playwright version: a plain
// `npx playwright` outside a project fetches the latest Playwright, which
// installs a different Chromium build than the one Blindfold looks for.

import { createRequire } from "node:module";
import type { Browser } from "playwright";

/** Chromium isn't installed for this Playwright version. Exit code 2. */
export class MissingBrowserError extends Error {}

export function installedPlaywrightVersion(): string {
  const require = createRequire(import.meta.url);
  return (require("playwright/package.json") as { version: string }).version;
}

export function missingBrowserMessage(): string {
  return `Chromium isn't installed. Run: npx playwright@${installedPlaywrightVersion()} install chromium`;
}

export function isMissingBrowserError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Executable doesn't exist");
}

/** Launches the browser, or throws MissingBrowserError when Chromium isn't installed. */
export async function launchOrExplainMissingBrowser(launch: () => Promise<Browser>): Promise<Browser> {
  try {
    return await launch();
  } catch (error) {
    if (isMissingBrowserError(error)) throw new MissingBrowserError(missingBrowserMessage());
    throw error;
  }
}
