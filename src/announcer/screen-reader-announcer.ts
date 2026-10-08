// Engine A: Guidepup's virtual screen reader, running inside the page. It
// listens for real focus changes, so Tab presses from Playwright drive it.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import type { Virtual } from "@guidepup/virtual-screen-reader";
import type { AnnouncerEngineName } from "../types/scan-result-types.ts";

export interface AnnouncerStatus {
  engine: AnnouncerEngineName;
  fallbackReason?: string;
}

declare global {
  interface Window {
    __blindfoldScreenReader?: Virtual;
  }
}

export const NOTHING_ANNOUNCED = "(nothing announced)";
const START_TIMEOUT_MILLISECONDS = 10_000;
// Guidepup speaks a tick after the focus event; when focus didn't move it says nothing.
const ANNOUNCEMENT_WAIT_MILLISECONDS = 300;

let cachedBundleSource: string | undefined;

/** Guidepup ships a self-contained browser build, so no bundling step is needed. */
async function loadScreenReaderBundle(): Promise<string> {
  if (cachedBundleSource === undefined) {
    const bundlePath = fileURLToPath(import.meta.resolve("@guidepup/virtual-screen-reader/browser.js"));
    cachedBundleSource = await readFile(bundlePath, "utf8");
  }
  return cachedBundleSource;
}

/** Starts Guidepup in the page, or reports why the fallback engine must be used. */
export async function startScreenReaderAnnouncer(page: Page): Promise<AnnouncerStatus> {
  try {
    const bundleSource = await loadScreenReaderBundle();
    // A blob URL works on any origin; bypassCSP on the context lets it load.
    const startInPage = page.evaluate(async (source) => {
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      // Built from a string so build tools (e.g. Vitest) can't rewrite import().
      const importModule = new Function("url", "return import(url)") as (url: string) => Promise<unknown>;
      const { virtual } = (await importModule(moduleUrl)) as { virtual: Virtual };
      await virtual.start({ container: document.body });
      window.__blindfoldScreenReader = virtual;
    }, bundleSource);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("it did not start within 10 seconds")), START_TIMEOUT_MILLISECONDS),
    );
    await Promise.race([startInPage, timeout]);
    return { engine: "guidepup-virtual-screen-reader" };
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return { engine: "accessibility-snapshot-fallback", fallbackReason: `Guidepup could not start: ${reason}` };
  }
}

export async function clearAnnouncements(page: Page): Promise<void> {
  await page.evaluate(() => window.__blindfoldScreenReader?.clearSpokenPhraseLog());
}

/** Everything spoken since the last clear, joined with " | ". */
export async function readAnnouncement(page: Page): Promise<string> {
  const phrases = await page.evaluate(async (waitMilliseconds) => {
    const screenReader = window.__blindfoldScreenReader;
    if (!screenReader) return [];
    const startedAt = performance.now();
    while (performance.now() - startedAt < waitMilliseconds) {
      const log = await screenReader.spokenPhraseLog();
      if (log.length > 0) return log;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return [];
  }, ANNOUNCEMENT_WAIT_MILLISECONDS);
  return phrases.length > 0 ? phrases.join(" | ") : NOTHING_ANNOUNCED;
}

/** Everything spoken since the last clear, without waiting. */
export async function readAllAnnouncements(page: Page): Promise<string[]> {
  return page.evaluate(async () => (await window.__blindfoldScreenReader?.spokenPhraseLog()) ?? []);
}
