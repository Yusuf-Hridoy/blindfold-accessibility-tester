// `blindfold login <url> --save-session <file>`: opens a visible browser, the
// user logs in by hand and closes the window, and Blindfold saves the login
// (Playwright storage state: cookies and localStorage) for --session.

import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { launchOrExplainMissingBrowser } from "../browser/missing-browser-check.ts";
import { describeError, ScanFailedError } from "../scan/page-scanner.ts";
import type { SessionState } from "./session-file-loader.ts";

// Closing the last window can shut the browser down before the login can be
// read, so a fresh copy is kept after every page load and every 2 seconds.
const SNAPSHOT_INTERVAL_MILLISECONDS = 2_000;

export interface SavedLogin {
  filePath: string;
  cookieCount: number;
}

/** Resolves once the user has closed every window (or the browser has gone away). */
function waitUntilWindowsClosed(browser: Browser, context: BrowserContext): Promise<void> {
  return new Promise((resolve) => {
    const checkPagesLeft = () => {
      if (context.pages().length === 0) resolve();
    };
    const watchPage = (page: Page) => page.on("close", checkPagesLeft);
    context.pages().forEach(watchPage);
    context.on("page", watchPage);
    context.on("close", () => resolve());
    browser.on("disconnected", () => resolve());
  });
}

/** `launch` is replaceable so the flow can be checked without a visible window. */
export async function recordLoginSession(
  url: string,
  sessionFile: string,
  launch: () => Promise<Browser> = () => chromium.launch({ headless: false }),
  onReady?: (page: Page) => Promise<void>,
): Promise<SavedLogin> {
  const browser = await launchOrExplainMissingBrowser(launch);
  let latest: SessionState | null = null;
  try {
    const context = await browser.newContext({ viewport: null });
    const takeSnapshot = async () => {
      try {
        latest = await context.storageState();
      } catch {
        // The context is closing; keep the last good copy.
      }
    };
    context.on("page", (page) => page.on("load", () => void takeSnapshot()));
    const page = await context.newPage();
    try {
      await page.goto(url);
    } catch (error) {
      throw new ScanFailedError(`Couldn't open ${url} (${describeError(error)}). Check the URL.`);
    }
    await takeSnapshot();
    const timer = setInterval(() => void takeSnapshot(), SNAPSHOT_INTERVAL_MILLISECONDS);
    try {
      const closed = waitUntilWindowsClosed(browser, context);
      await onReady?.(page);
      await closed;
    } finally {
      clearInterval(timer);
    }
    await takeSnapshot();
  } finally {
    await browser.close().catch(() => {});
  }

  const saved = latest as SessionState | null;
  if (!saved) throw new ScanFailedError("No login was saved: the browser closed before Blindfold could read it. Try again.");
  const filePath = path.resolve(sessionFile);
  try {
    await writeFile(filePath, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 });
    // writeFile only sets the mode on a new file.
    await chmod(filePath, 0o600);
  } catch (error) {
    throw new ScanFailedError(`Couldn't save the session to ${filePath} (${describeError(error)}).`);
  }
  return { filePath, cookieCount: saved.cookies.length };
}
