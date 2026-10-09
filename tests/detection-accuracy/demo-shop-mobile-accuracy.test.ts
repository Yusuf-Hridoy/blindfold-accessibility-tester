// The mobile benchmark (390×844): buggy-shop must report exactly the planted
// bugs that show at phone size, including the mobile-only menu toggle (BF-001);
// accessible-shop nothing. The mobile journey's effort is locked in too.

import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { startDemoSiteServer, type RunningDemoSiteServer } from "../../demo-sites/serve-demo-sites.ts";
import { launchBrowser } from "../../src/browser/browser-launcher.ts";
import { loadJourneyFile } from "../../src/journeys/journey-file-loader.ts";
import { runJourney } from "../../src/journeys/journey-runner.ts";
import { scanPage, type ScanOutcome } from "../../src/scan/page-scanner.ts";
import type { RuleId } from "../../src/types/scan-result-types.ts";

/** Per page: each expected rule, and a CSS selector for exactly the elements it must report. */
const EXPECTED_BUGGY_MOBILE_FINDINGS: Record<string, Partial<Record<RuleId, string>>> = {
  "index.html": { "BF-001": ".menu-toggle", "BF-002": ".cart-button", "BF-003": "#newsletter-email" },
  "product-linen-tote-bag.html": { "BF-001": ".menu-toggle", "BF-002": ".cart-button" },
  "cart.html": { "BF-001": ".menu-toggle, .checkout-button", "BF-002": ".cart-button" },
  "checkout.html": { "BF-001": ".menu-toggle", "BF-002": ".cart-button" },
};
const PAGES = Object.keys(EXPECTED_BUGGY_MOBILE_FINDINGS);
const MOBILE_JOURNEY = path.join(import.meta.dirname, "..", "..", "example-journeys", "mobile-menu-to-cart-journey.yaml");

let browser: Browser;
let buggyServer: RunningDemoSiteServer;
let accessibleServer: RunningDemoSiteServer;

beforeAll(async () => {
  browser = await launchBrowser();
  buggyServer = await startDemoSiteServer({ shop: "buggy", port: 0 });
  accessibleServer = await startDemoSiteServer({ shop: "accessible", port: 0 });
});

afterAll(async () => {
  await browser.close();
  await buggyServer.close();
  await accessibleServer.close();
});

function scanDemoPageOnMobile(server: RunningDemoSiteServer, page: string): Promise<ScanOutcome> {
  return scanPage({
    url: `${server.url}/${page}?no-cookie-banner=1`,
    browser,
    maxTabs: 400,
    pageTimeoutSeconds: 30,
    screenshots: false,
    viewport: "mobile",
  });
}

/** True when the reported selectors point at exactly the elements the expected selector matches, at mobile size. */
async function selectorsMatchExactly(url: string, reported: string[], expected: string): Promise<boolean> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  try {
    const page = await context.newPage();
    await page.goto(url);
    return await page.evaluate(
      ({ reportedSelectors, expectedSelector }) => {
        const reportedElements = reportedSelectors.map((selector) => document.querySelectorAll(selector));
        if (reportedElements.some((matches) => matches.length !== 1)) return false;
        const reportedSet = new Set(reportedElements.map((matches) => matches[0]));
        const expectedElements = [...document.querySelectorAll(expectedSelector)];
        return reportedSet.size === expectedElements.length && expectedElements.every((element) => reportedSet.has(element));
      },
      { reportedSelectors: reported, expectedSelector: expected },
    );
  } finally {
    await context.close();
  }
}

describe("mobile: buggy shop reports exactly the planted bugs that show at phone size", () => {
  it.each(PAGES)("%s", async (page) => {
    const outcome = await scanDemoPageOnMobile(buggyServer, page);
    expect(outcome.result.viewport).toEqual({ width: 390, height: 844, name: "mobile" });
    const expected = EXPECTED_BUGGY_MOBILE_FINDINGS[page] ?? {};
    const reportedRules = [...new Set(outcome.result.findings.map((finding) => finding.ruleId))].sort();
    expect(reportedRules).toEqual(Object.keys(expected).sort());

    for (const [ruleId, expectedSelector] of Object.entries(expected)) {
      const reported = outcome.result.findings.filter((finding) => finding.ruleId === ruleId).map((finding) => finding.selector);
      const matches = await selectorsMatchExactly(outcome.result.url, reported, expectedSelector);
      expect(matches, `${ruleId} on ${page}: reported ${reported.join(", ")}`).toBe(true);
    }
    expect(outcome.result.notTested).toEqual([]);
  });

  it("index.html: the trap cycles between the newsletter email field and Subscribe", async () => {
    const outcome = await scanDemoPageOnMobile(buggyServer, "index.html");
    expect(outcome.result.stoppedBecause).toBe("focus-trap");
    const cycle = outcome.result.trap?.cycle.map((element) => element.selector) ?? [];
    expect(cycle).toHaveLength(2);
    expect(await selectorsMatchExactly(outcome.result.url, cycle.slice(0, 1), "#newsletter-email")).toBe(true);
    expect(await selectorsMatchExactly(outcome.result.url, cycle.slice(1), ".newsletter-subscribe-button")).toBe(true);
  });
});

describe("mobile: accessible shop reports nothing", () => {
  it.each(PAGES)("%s", async (page) => {
    const outcome = await scanDemoPageOnMobile(accessibleServer, page);
    expect(outcome.result.findings).toEqual([]);
    expect(outcome.result.notTested).toEqual([]);
    expect(outcome.result.engine.name).toBe("guidepup-virtual-screen-reader");
  });
});

describe("mobile journey: open the menu, then the cart", () => {
  it("buggy shop: blocked at step 1 by the menu toggle (BF-001), with BF-002 on the cart button", async () => {
    const journey = await loadJourneyFile(MOBILE_JOURNEY, buggyServer.url);
    expect(journey.viewport).toBe("mobile");
    const { result } = await runJourney({ journey, browser, maxTabsPerStep: 100, pageTimeoutSeconds: 30, screenshots: false });
    expect(result.viewport.name).toBe("mobile");
    expect(result.outcome).toBe("blocked");
    expect(result.blockedAtStep).toBe(1);
    expect(result.steps.map((step) => step.status)).toEqual(["failed", "not-run"]);
    expect(result.steps[0]?.neverReachedBecause).toBe("full-cycle");

    const stepFindings = result.findings.filter((finding) => finding.journeyStep === 1);
    expect([...new Set(stepFindings.map((finding) => finding.ruleId))].sort()).toEqual(["BF-001", "BF-002"]);
    for (const [ruleId, expectedSelector] of [["BF-001", ".menu-toggle"], ["BF-002", ".cart-button"]] as const) {
      const reported = stepFindings.filter((finding) => finding.ruleId === ruleId).map((finding) => finding.selector);
      expect(await selectorsMatchExactly(result.startUrl, reported, expectedSelector), `${ruleId}: reported ${reported.join(", ")}`).toBe(true);
    }
    expect(result.findings).toHaveLength(stepFindings.length);
    expect(result.effort).toMatchObject({ keyboardPresses: 7, mouseClicks: 1, ratio: 7, untilBlocked: true });
    expect(result.effort.perStep.map((step) => step.keyboardPresses)).toEqual([7]);
  });

  it("accessible shop: passes with no findings and ends on the cart", async () => {
    const journey = await loadJourneyFile(MOBILE_JOURNEY, accessibleServer.url);
    const { result } = await runJourney({ journey, browser, maxTabsPerStep: 100, pageTimeoutSeconds: 30, screenshots: false });
    expect(result.outcome).toBe("passed");
    expect(result.findings).toEqual([]);
    expect(result.steps.map((step) => step.status)).toEqual(["passed", "passed"]);
    expect(new URL(result.finalUrl).pathname).toBe("/cart.html");
    expect(result.effort).toMatchObject({ keyboardPresses: 8, mouseClicks: 2, ratio: 4, untilBlocked: false });
    expect(result.effort.perStep.map((step) => step.keyboardPresses)).toEqual([4, 4]);
  });
});
