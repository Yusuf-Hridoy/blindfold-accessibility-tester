// Orchestrates one page scan: load, mouse pass, baselines, screen reader,
// keyboard pass, rules, screenshots.

import type { Browser, Locator, Page } from "playwright";
import { createScanContext, DESKTOP_VIEWPORT, launchBrowser } from "../browser/browser-launcher.ts";
import { startScreenReaderAnnouncer } from "../announcer/screen-reader-announcer.ts";
import { recordFocusStyleBaselines } from "../focus/focus-style-baseline.ts";
import { detectOverlays } from "../overlays/blocking-overlay-detector.ts";
import { checkMouseTargets, collectMousePassElements } from "../passes/mouse-pass-collector.ts";
import { walkWithKeyboard } from "../passes/keyboard-pass-walker.ts";
import { runRules } from "../rules/rule-engine.ts";
import { TOOL_VERSION } from "../tool-version.ts";
import type { BoundingBox, Finding, FocusStop, ScanResult } from "../types/scan-result-types.ts";

export interface ScanOptions {
  url: string;
  maxTabs: number;
  pageTimeoutSeconds: number;
  screenshots: boolean;
  /** Reuse a running browser (tests scan many pages); otherwise one is launched and closed. */
  browser?: Browser;
}

export interface ScanOutcome {
  result: ScanResult;
  /** PNG screenshots as base64, per finding. Kept out of report.json on purpose. */
  screenshots: Map<Finding, string>;
}

/** The scan could not be completed. This is never a finding about the site. */
export class ScanFailedError extends Error {}

const NETWORK_SETTLE_CAP_MILLISECONDS = 2_000;
const SCREENSHOT_PADDING = 8;

export function describeError(error: unknown): string {
  return error instanceof Error ? (error.message.split("\n")[0] ?? error.message) : String(error);
}

export function parseScanUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ScanFailedError(`"${url}" is not a valid URL. Use a full address such as http://localhost:4000/.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ScanFailedError(`Blindfold can only scan http:// and https:// pages, not "${parsed.protocol}" URLs.`);
  }
  return parsed;
}

function describeLoadFailure(url: string, error: unknown, timeoutSeconds: number): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ERR_CONNECTION_REFUSED")) {
    return `Couldn't load ${url} (connection refused). Check the URL is running.`;
  }
  if (message.includes("ERR_UNSAFE_PORT")) {
    return `Couldn't load ${url} (browsers block this port as unsafe). Run the site on a different port.`;
  }
  if (message.includes("ERR_NAME_NOT_RESOLVED")) {
    return `Couldn't load ${url} (address not found). Check the URL is spelled correctly.`;
  }
  if (message.includes("ERR_CERT")) {
    return `Couldn't load ${url} (certificate error). Check the site's HTTPS certificate.`;
  }
  if (message.includes("Timeout")) {
    return `${url} didn't finish loading within ${timeoutSeconds} seconds. Check the site is responding, or raise --page-timeout.`;
  }
  return `Couldn't load ${url} (${message.split("\n")[0]}).`;
}

export async function loadPage(page: Page, url: string, timeoutSeconds: number): Promise<void> {
  let response;
  try {
    response = await page.goto(url, { waitUntil: "load", timeout: timeoutSeconds * 1000 });
  } catch (error) {
    throw new ScanFailedError(describeLoadFailure(url, error, timeoutSeconds));
  }
  if (!response) {
    throw new ScanFailedError(`Couldn't load ${url} (the browser got no response). Check the URL.`);
  }
  if (response.status() < 200 || response.status() > 299) {
    const status = [response.status(), response.statusText()].filter(Boolean).join(" ");
    throw new ScanFailedError(`${url} returned HTTP ${status}. Blindfold only scans pages that load successfully (2xx).`);
  }
  await page.waitForLoadState("networkidle", { timeout: NETWORK_SETTLE_CAP_MILLISECONDS }).catch(() => {
    // Busy pages (polling, analytics) never go idle; the cap keeps the scan moving.
  });
}

function padToViewport(box: BoundingBox): BoundingBox {
  const x = Math.max(0, box.x - SCREENSHOT_PADDING);
  const y = Math.max(0, box.y - SCREENSHOT_PADDING);
  return {
    x,
    y,
    width: Math.min(DESKTOP_VIEWPORT.width, box.x + box.width + SCREENSHOT_PADDING) - x,
    height: Math.min(DESKTOP_VIEWPORT.height, box.y + box.height + SCREENSHOT_PADDING) - y,
  };
}

/** Screenshot of an element plus a small margin, so focus rings drawn outside it show. */
export async function captureElementScreenshot(page: Page, locator: Locator, scrollIntoView: boolean): Promise<string | null> {
  try {
    if (scrollIntoView) await locator.scrollIntoViewIfNeeded({ timeout: 2_000 });
    const box = await locator.boundingBox({ timeout: 2_000 });
    if (!box || box.width === 0 || box.height === 0) return null;
    const clip = padToViewport(box);
    if (clip.width <= 0 || clip.height <= 0) return null;
    const image = await page.screenshot({ clip, type: "png" });
    return image.toString("base64");
  } catch {
    return null;
  }
}

/** Selector of the smallest element containing every element of a trap cycle. */
export async function selectorContainingAll(page: Page, elementIds: number[]): Promise<string | null> {
  return page.evaluate((ids) => {
    const helpers = window.__blindfoldElements;
    const elements = ids.map((id) => helpers.elementForId(id)).filter((element) => element !== undefined);
    let container = elements[0]?.parentElement ?? null;
    while (container && !elements.every((element) => container?.contains(element))) {
      container = container.parentElement;
    }
    return container ? helpers.selectorFor(container) : null;
  }, elementIds);
}

/** Screenshots for each finding: BF-002 and BF-004 at focus time, the rest afterwards. */
async function captureFindingScreenshots(
  page: Page,
  findings: Finding[],
  focusTimeScreenshots: Map<number, string>,
): Promise<Map<Finding, string>> {
  const screenshots = new Map<Finding, string>();
  for (const finding of findings) {
    let image: string | null | undefined;
    if (finding.ruleId === "BF-002" || finding.ruleId === "BF-004") {
      image = focusTimeScreenshots.get(finding.elementId);
    } else if (finding.ruleId === "BF-003" && finding.trapCycle) {
      const containerSelector = await selectorContainingAll(page, finding.trapCycle.map((element) => element.elementId));
      if (containerSelector) image = await captureElementScreenshot(page, page.locator(containerSelector).first(), true);
    } else {
      image = await captureElementScreenshot(page, page.locator(finding.selector).first(), true);
    }
    if (image) screenshots.set(finding, image);
  }
  return screenshots;
}

/** Stops that may become BF-002 or BF-004 findings; screenshot them while focused. */
function mightBecomeFocusFinding(stop: FocusStop): boolean {
  return stop.accessibleName.trim() === "" || stop.focusVisible === false;
}

export async function scanPage(options: ScanOptions): Promise<ScanOutcome> {
  const startedAt = Date.now();
  const url = parseScanUrl(options.url).href;

  let browser: Browser;
  try {
    browser = options.browser ?? (await launchBrowser());
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    throw new ScanFailedError(`Couldn't start Chromium (${reason}). Run "npx playwright install chromium" and try again.`);
  }

  const context = await createScanContext(browser);
  try {
    const page = await context.newPage();
    await loadPage(page, url, options.pageTimeoutSeconds);

    const mousePassCandidates = await collectMousePassElements(page);
    // At page load, before any key press: the overlay the user is faced with.
    const blockingOverlays = await detectOverlays(page, mousePassCandidates.map((element) => element.elementId));
    await recordFocusStyleBaselines(page);
    const announcer = await startScreenReaderAnnouncer(page);

    const focusTimeScreenshots = new Map<number, string>();
    const walk = await walkWithKeyboard(page, {
      maxTabs: options.maxTabs,
      useScreenReader: announcer.engine === "guidepup-virtual-screen-reader",
      onFocusStop: async (stop) => {
        if (!options.screenshots || !mightBecomeFocusFinding(stop) || focusTimeScreenshots.has(stop.elementId)) return;
        const image = await captureElementScreenshot(page, page.locator(":focus").first(), false);
        if (image) focusTimeScreenshots.set(stop.elementId, image);
      },
    });

    // After the walk, so scrolling for the hit-test can't affect the keyboard pass.
    const reachedElementIds = new Set(walk.focusStops.map((stop) => stop.elementId));
    const mousePassElements = await checkMouseTargets(page, mousePassCandidates, reachedElementIds);

    const { findings, notTested } = runRules({
      mousePassElements,
      focusStops: walk.focusStops,
      stoppedBecause: walk.stoppedBecause,
      trap: walk.trap,
      blockingOverlays,
    });
    const screenshots = options.screenshots
      ? await captureFindingScreenshots(page, findings, focusTimeScreenshots)
      : new Map<Finding, string>();

    const result: ScanResult = {
      toolVersion: TOOL_VERSION,
      url,
      scannedAt: new Date(startedAt).toISOString(),
      engine: announcer.fallbackReason
        ? { name: announcer.engine, fallbackReason: announcer.fallbackReason }
        : { name: announcer.engine },
      viewport: { ...DESKTOP_VIEWPORT },
      maxTabs: options.maxTabs,
      stoppedBecause: walk.stoppedBecause,
      focusStops: walk.focusStops,
      mousePassElements,
      trap: walk.trap,
      blockingOverlays,
      findings,
      notTested,
      durationMilliseconds: Date.now() - startedAt,
    };
    return { result, screenshots };
  } catch (error) {
    if (error instanceof ScanFailedError) throw error;
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    throw new ScanFailedError(`The scan of ${url} stopped unexpectedly (${reason}).`);
  } finally {
    await context.close().catch(() => {});
    if (!options.browser) await browser.close().catch(() => {});
  }
}
