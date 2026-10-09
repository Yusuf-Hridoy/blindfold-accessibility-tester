// Engine A: Guidepup's virtual screen reader, running inside the page. It
// listens for real focus changes, so Tab presses from Playwright drive it.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Frame, Page } from "playwright";
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
// Frames where Guidepup is running: the page's main frame and same-origin iframes.
const framesWithScreenReader = new WeakSet<Frame>();

function frameOf(target: Page | Frame): Frame {
  return "mainFrame" in target ? target.mainFrame() : target;
}

/** Guidepup was started in this frame (frames where it wasn't fall back to Engine B text). */
export function screenReaderRunsIn(frame: Frame): boolean {
  return framesWithScreenReader.has(frame);
}

/** Guidepup ships a self-contained browser build, so no bundling step is needed. */
async function loadScreenReaderBundle(): Promise<string> {
  if (cachedBundleSource === undefined) {
    const bundlePath = fileURLToPath(import.meta.resolve("@guidepup/virtual-screen-reader/browser.js"));
    cachedBundleSource = await readFile(bundlePath, "utf8");
  }
  return cachedBundleSource;
}

/** Starts Guidepup in the page (or one of its frames), or reports why the fallback engine must be used. */
export async function startScreenReaderAnnouncer(target: Page | Frame): Promise<AnnouncerStatus> {
  const frame = frameOf(target);
  framesWithScreenReader.delete(frame);
  try {
    const bundleSource = await loadScreenReaderBundle();
    // A blob URL works on any origin; bypassCSP on the context lets it load.
    const startInPage = frame.evaluate(async (source) => {
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      // Built from a string so build tools (e.g. Vitest) can't rewrite import().
      const importModule = new Function("url", "return import(url)") as (url: string) => Promise<unknown>;
      const { virtual } = (await importModule(moduleUrl)) as { virtual: Virtual };
      await virtual.start({ container: document.body });
      window.__blindfoldScreenReader = virtual;
    }, bundleSource);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("it did not start within 10 seconds")), START_TIMEOUT_MILLISECONDS);
    });
    // Cleared either way: a pending timer would keep the CLI process alive for 10 seconds after it finishes.
    await Promise.race([startInPage, timeout]).finally(() => clearTimeout(timer));
    framesWithScreenReader.add(frame);
    return { engine: "guidepup-virtual-screen-reader" };
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return { engine: "accessibility-snapshot-fallback", fallbackReason: `Guidepup could not start: ${reason}` };
  }
}

/** Clears what was spoken, in the page and every frame where the screen reader runs. */
export async function clearAnnouncements(page: Page): Promise<void> {
  await page.evaluate(() => window.__blindfoldScreenReader?.clearSpokenPhraseLog());
  for (const frame of page.frames()) {
    if (frame === page.mainFrame() || !framesWithScreenReader.has(frame)) continue;
    await frame.evaluate(() => window.__blindfoldScreenReader?.clearSpokenPhraseLog()).catch(() => {});
  }
}

/** Everything spoken (in the page, or in the frame given) since the last clear, joined with " | ". */
export async function readAnnouncement(target: Page | Frame): Promise<string> {
  const phrases = await frameOf(target).evaluate(async (waitMilliseconds) => {
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
