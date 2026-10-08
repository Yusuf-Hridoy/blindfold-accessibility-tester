// Announcer spike: press Tab through a page and record, for each focus stop,
// what two engines say a screen reader would announce, plus whether a visible
// focus indicator appears. Run with `npm run spike:announcer`.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright";
import type { Virtual } from "@guidepup/virtual-screen-reader";
import { DEFAULT_DEMO_SHOP_PORTS, startDemoSiteServer } from "../demo-sites/serve-demo-sites.ts";

export interface AnnouncerStep {
  step: number;
  /** Short DOM description, e.g. `a.nav-link "Shop"`. */
  element: string;
  /** Engine A: what Guidepup's virtual screen reader spoke after this Tab. */
  engineA: string;
  /** Engine B: role + accessible name from Playwright's ARIA snapshot. */
  engineB: string;
  /** null when the element had no baseline (it did not exist at page load). */
  focusVisible: boolean | null;
  /** Which computed-style properties changed between baseline and focus. */
  focusStyleChanges: string[];
  /** Engine A: time inside the page from the focus event until Guidepup had spoken. */
  engineAMilliseconds: number;
  /** Engine A: Node-to-page round trip to read the spoken phrases. */
  engineAReadMilliseconds: number;
  /** Engine B: Node-to-page round trip for the ARIA snapshot (it computes on request). */
  engineBMilliseconds: number;
}

export interface AnnouncerSpikeResult {
  pageUrl: string;
  engineAStatus: string;
  focusVisibleMethod: "computed-style-baseline";
  steps: AnnouncerStep[];
}

type FocusStyles = Record<string, string>;

declare global {
  interface Window {
    __blindfoldVirtual?: Virtual;
    __blindfoldVirtualStatus?: string;
    __blindfoldEngineALatency?: number | null;
    __blindfoldFocusBaselines?: WeakMap<Element, FocusStyles>;
    __blindfoldReadFocusStyles?: (element: Element) => FocusStyles;
  }
}

// Guidepup handles focus asynchronously (it waits a tick, then rebuilds its
// accessibility tree), so its cost is not inside the Tab key press itself.
const GUIDEPUP_BUNDLE_URL_PATH = "/__blindfold/virtual-screen-reader.js";
const NOTHING_ANNOUNCED = "(nothing announced)";
const FOCUS_ON_BODY = "(focus on page body)";
// Guidepup reacts to the browser's focusin event; this is how long we wait for it.
const ENGINE_A_WAIT_MILLISECONDS = 500;

/** The properties a focus indicator is normally built from. */
const FOCUS_STYLE_PROPERTIES = [
  "outline-style",
  "outline-width",
  "outline-color",
  "outline-offset",
  "box-shadow",
  "border-top-style",
  "border-top-width",
  "border-top-color",
  "border-right-style",
  "border-right-width",
  "border-right-color",
  "border-bottom-style",
  "border-bottom-width",
  "border-bottom-color",
  "border-left-style",
  "border-left-width",
  "border-left-color",
  "background-color",
  "background-image",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-color",
  "text-decoration-thickness",
];

const FOCUSABLE_SELECTOR =
  'a[href], area[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable="true"]';

/** Defines the style reader in the page and records every focusable element's unfocused styles. */
async function recordFocusStyleBaselines(page: Page): Promise<void> {
  await page.evaluate(
    ({ properties, focusableSelector }) => {
      window.__blindfoldReadFocusStyles = (element) => {
        const computed = getComputedStyle(element);
        const styles: FocusStyles = {};
        for (const property of properties) {
          styles[property] = computed.getPropertyValue(property);
        }
        // An outline with no style or no width draws nothing, whatever its colour.
        if (styles["outline-style"] === "none" || parseFloat(styles["outline-width"] ?? "0") === 0) {
          styles["outline-style"] = "none";
          styles["outline-width"] = "0px";
          styles["outline-color"] = "none";
          styles["outline-offset"] = "0px";
        }
        return styles;
      };
      const baselines = new WeakMap<Element, FocusStyles>();
      for (const element of document.querySelectorAll(focusableSelector)) {
        baselines.set(element, window.__blindfoldReadFocusStyles(element));
      }
      window.__blindfoldFocusBaselines = baselines;
    },
    { properties: FOCUS_STYLE_PROPERTIES, focusableSelector: FOCUSABLE_SELECTOR },
  );
}

async function compareFocusedElementWithBaseline(
  page: Page,
): Promise<{ focusVisible: boolean | null; focusStyleChanges: string[] }> {
  return page.evaluate(() => {
    const focused = document.activeElement;
    const baseline = focused ? window.__blindfoldFocusBaselines?.get(focused) : undefined;
    if (!focused || focused === document.body || !baseline || !window.__blindfoldReadFocusStyles) {
      return { focusVisible: null, focusStyleChanges: [] };
    }
    const current = window.__blindfoldReadFocusStyles(focused);
    const focusStyleChanges = Object.keys(current).filter((property) => current[property] !== baseline[property]);
    return { focusVisible: focusStyleChanges.length > 0, focusStyleChanges };
  });
}

/** Serves Guidepup's prebuilt browser bundle to the page and starts it on document.body. */
async function startGuidepupInPage(page: Page): Promise<string> {
  const bundlePath = fileURLToPath(import.meta.resolve("@guidepup/virtual-screen-reader/browser.js"));
  const bundleSource = await readFile(bundlePath, "utf8");
  await page.route(`**${GUIDEPUP_BUNDLE_URL_PATH}`, (route) =>
    route.fulfill({ body: bundleSource, contentType: "text/javascript" }),
  );
  await page.addScriptTag({
    type: "module",
    content: `
      try {
        const { virtual } = await import("${GUIDEPUP_BUNDLE_URL_PATH}");
        await virtual.start({ container: document.body });
        window.__blindfoldVirtual = virtual;
        window.__blindfoldVirtualStatus = "working";
      } catch (error) {
        window.__blindfoldVirtualStatus = "failed: " + String(error);
      }
    `,
  });
  await page.waitForFunction(() => window.__blindfoldVirtualStatus !== undefined, undefined, { timeout: 10_000 });
  return page.evaluate(() => window.__blindfoldVirtualStatus ?? "failed: unknown");
}

/**
 * Passively times Guidepup: when focus moves, note the time and watch its speech
 * log until a phrase appears. Only reads; never touches focus or the page.
 */
async function startTimingGuidepupSpeech(page: Page, maxWaitMilliseconds: number): Promise<void> {
  // No named functions inside page.evaluate: tsx wraps them in a __name helper
  // that does not exist in the browser.
  await page.evaluate((maxWait) => {
    window.addEventListener(
      "focusin",
      () => {
        const startedAt = performance.now();
        window.__blindfoldEngineALatency = null;
        void (async () => {
          while (performance.now() - startedAt < maxWait) {
            const log = (await window.__blindfoldVirtual?.spokenPhraseLog()) ?? [];
            if (log.length > 0) {
              window.__blindfoldEngineALatency = performance.now() - startedAt;
              return;
            }
            // A MessageChannel yield is much finer-grained than setTimeout.
            await new Promise<void>((resolve) => {
              const channel = new MessageChannel();
              channel.port1.onmessage = () => resolve();
              channel.port2.postMessage(null);
            });
          }
        })();
      },
      { capture: true },
    );
  }, maxWaitMilliseconds);
}

async function clearGuidepupLog(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__blindfoldEngineALatency = null;
    return window.__blindfoldVirtual?.clearSpokenPhraseLog();
  });
}

/** Returns everything Guidepup spoke since the log was last cleared, plus its in-page latency. */
async function readGuidepupAnnouncement(page: Page): Promise<{ announcement: string; latencyMilliseconds: number | null }> {
  const { phrases, latency } = await page.evaluate(async (waitMilliseconds) => {
    const virtual = window.__blindfoldVirtual;
    if (!virtual) return { phrases: [], latency: null };
    const startedAt = performance.now();
    let log: string[] = [];
    while (performance.now() - startedAt < waitMilliseconds) {
      log = await virtual.spokenPhraseLog();
      // Also wait for the in-page timer, which may notice the phrase a moment later.
      const latency = window.__blindfoldEngineALatency ?? null;
      if (log.length > 0 && latency !== null) return { phrases: log, latency };
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    return { phrases: log, latency: null };
  }, ENGINE_A_WAIT_MILLISECONDS);
  return {
    announcement: phrases.length > 0 ? phrases.join(" | ") : NOTHING_ANNOUNCED,
    latencyMilliseconds: latency === null ? null : roundToTenth(latency),
  };
}

/** Turns `- button "Cart":` into `button "Cart"`. */
function firstAriaSnapshotLine(snapshot: string): string {
  const firstLine = snapshot.split("\n")[0] ?? "";
  return firstLine.replace(/^- /, "").replace(/:$/, "");
}

async function readPlaywrightAnnouncement(page: Page): Promise<string> {
  const focusIsOnBody = await page.evaluate(() => !document.activeElement || document.activeElement === document.body);
  if (focusIsOnBody) return FOCUS_ON_BODY;
  const snapshot = await page.locator(":focus").ariaSnapshot({ timeout: 2_000 });
  return firstAriaSnapshotLine(snapshot);
}

async function describeFocusedElement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return "body";
    const tag = element.tagName.toLowerCase();
    const identifier = element.id ? `#${element.id}` : element.classList[0] ? `.${element.classList[0]}` : "";
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
    return `${tag}${identifier} "${text}"`;
  });
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

async function timeIt<T>(work: () => Promise<T>): Promise<{ value: T; milliseconds: number }> {
  const startedAt = performance.now();
  const value = await work();
  return { value, milliseconds: roundToTenth(performance.now() - startedAt) };
}

/** Opens the page in headless Chromium, presses Tab repeatedly and records each focus stop. */
export async function runAnnouncerSpike(options: {
  pageUrl: string;
  tabPresses?: number;
}): Promise<AnnouncerSpikeResult> {
  const tabPresses = options.tabPresses ?? 25;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(options.pageUrl, { waitUntil: "load" });
    // Baselines first, before anything can be focused.
    await recordFocusStyleBaselines(page);
    const engineAStatus = await startGuidepupInPage(page);
    await startTimingGuidepupSpeech(page, ENGINE_A_WAIT_MILLISECONDS);

    const steps: AnnouncerStep[] = [];
    for (let step = 1; step <= tabPresses; step++) {
      await clearGuidepupLog(page);
      await page.keyboard.press("Tab");
      const engineA = await timeIt(() => readGuidepupAnnouncement(page));
      const engineB = await timeIt(() => readPlaywrightAnnouncement(page));
      const focusCheck = await compareFocusedElementWithBaseline(page);
      steps.push({
        step,
        element: await describeFocusedElement(page),
        engineA: engineA.value.announcement,
        engineB: engineB.value,
        focusVisible: focusCheck.focusVisible,
        focusStyleChanges: focusCheck.focusStyleChanges,
        engineAMilliseconds: engineA.value.latencyMilliseconds ?? Number.NaN,
        engineAReadMilliseconds: engineA.milliseconds,
        engineBMilliseconds: engineB.milliseconds,
      });
    }
    return { pageUrl: options.pageUrl, engineAStatus, focusVisibleMethod: "computed-style-baseline", steps };
  } finally {
    await browser.close();
  }
}

function fitToWidth(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width);
}

export function formatTranscriptTable(steps: AnnouncerStep[]): string {
  const formatFocusVisible = (value: boolean | null) => (value === null ? "unknown" : value ? "yes" : "no");
  const header = `${"#".padEnd(4)}${fitToWidth("element", 34)}  ${fitToWidth("Engine A (Guidepup)", 40)}  ${fitToWidth("Engine B (Playwright)", 30)}  ${"focus visible".padEnd(14)}A ms    B ms`;
  const rows = steps.map(
    (step) =>
      `${String(step.step).padEnd(4)}${fitToWidth(step.element, 34)}  ${fitToWidth(step.engineA, 40)}  ${fitToWidth(step.engineB, 30)}  ${formatFocusVisible(step.focusVisible).padEnd(14)}${String(step.engineAMilliseconds).padEnd(8)}${step.engineBMilliseconds}`,
  );
  return [header, "-".repeat(header.length), ...rows].join("\n");
}

function averageMilliseconds(values: number[]): number {
  const measured = values.filter((value) => Number.isFinite(value));
  return roundToTenth(measured.reduce((sum, value) => sum + value, 0) / measured.length);
}

async function runFromCommandLine(): Promise<void> {
  const port = DEFAULT_DEMO_SHOP_PORTS.buggy;
  let server;
  try {
    server = await startDemoSiteServer({ shop: "buggy", port });
  } catch (error) {
    const portInUse = (error as NodeJS.ErrnoException).code === "EADDRINUSE";
    console.error(
      portInUse
        ? `Port ${port} is already in use. Stop whatever is using it (for example npm run demo:buggy) and run the spike again.`
        : `Could not start the buggy shop: ${String(error)}`,
    );
    process.exit(1);
  }

  try {
    const result = await runAnnouncerSpike({ pageUrl: `${server.url}/?no-cookie-banner=1` });
    console.log(`Page: ${result.pageUrl}`);
    console.log(`Engine A (Guidepup) status: ${result.engineAStatus}\n`);
    console.log(formatTranscriptTable(result.steps));
    console.log(
      `\nAverage per step: Engine A ${averageMilliseconds(result.steps.map((s) => s.engineAMilliseconds))} ms in page ` +
        `+ ${averageMilliseconds(result.steps.map((s) => s.engineAReadMilliseconds))} ms to read, ` +
        `Engine B ${averageMilliseconds(result.steps.map((s) => s.engineBMilliseconds))} ms`,
    );
    const outputPath = path.join(import.meta.dirname, "announcer-spike-output.json");
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`\nSaved to ${path.relative(process.cwd(), outputPath)}`);
  } finally {
    await server.close();
  }
}

const isRunDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isRunDirectly) {
  await runFromCommandLine();
}
