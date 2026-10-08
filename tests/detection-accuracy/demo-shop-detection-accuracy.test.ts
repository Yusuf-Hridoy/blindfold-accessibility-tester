// The benchmark: buggy-shop must report exactly the planted Phase 1 bugs, and
// accessible-shop nothing. "Exactly" means no extra rules and no extra elements.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { startDemoSiteServer, type RunningDemoSiteServer } from "../../demo-sites/serve-demo-sites.ts";
import { launchBrowser } from "../../src/browser/browser-launcher.ts";
import { scanPage, type ScanOutcome } from "../../src/scan/page-scanner.ts";
import type { RuleId } from "../../src/types/scan-result-types.ts";

/** Per page: each expected rule, and a CSS selector for exactly the elements it must report. */
const EXPECTED_BUGGY_FINDINGS: Record<string, Partial<Record<RuleId, string>>> = {
  "index.html": { "BF-002": ".cart-button", "BF-003": "#newsletter-email", "BF-004": ".nav-link" },
  "product-linen-tote-bag.html": { "BF-002": ".cart-button", "BF-004": ".nav-link" },
  "cart.html": { "BF-001": ".checkout-button", "BF-002": ".cart-button", "BF-004": ".nav-link" },
  "checkout.html": { "BF-002": ".cart-button", "BF-004": ".nav-link" },
};
const PAGES = Object.keys(EXPECTED_BUGGY_FINDINGS);

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

function scanDemoPage(server: RunningDemoSiteServer, page: string, withCookieBanner = false): Promise<ScanOutcome> {
  return scanPage({
    url: withCookieBanner ? `${server.url}/${page}` : `${server.url}/${page}?no-cookie-banner=1`,
    browser,
    maxTabs: 400,
    pageTimeoutSeconds: 30,
    screenshots: false,
  });
}

/** True when the reported selectors point at exactly the elements the expected selector matches. */
async function selectorsMatchExactly(url: string, reported: string[], expected: string): Promise<boolean> {
  const context = await browser.newContext();
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

describe("buggy shop reports exactly the planted bugs", () => {
  it.each(PAGES)("%s", async (page) => {
    const outcome = await scanDemoPage(buggyServer, page);
    const expected = EXPECTED_BUGGY_FINDINGS[page] ?? {};
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
    const outcome = await scanDemoPage(buggyServer, "index.html");
    expect(outcome.result.stoppedBecause).toBe("focus-trap");
    const cycle = outcome.result.trap?.cycle.map((element) => element.selector) ?? [];
    expect(cycle).toHaveLength(2);
    expect(await selectorsMatchExactly(outcome.result.url, cycle.slice(0, 1), "#newsletter-email")).toBe(true);
    expect(await selectorsMatchExactly(outcome.result.url, cycle.slice(1), ".newsletter-subscribe-button")).toBe(true);
  });
});

describe("accessible shop reports nothing", () => {
  it.each(PAGES)("%s", async (page) => {
    const outcome = await scanDemoPage(accessibleServer, page);
    expect(outcome.result.findings).toEqual([]);
    expect(outcome.result.notTested).toEqual([]);
    expect(outcome.result.engine.name).toBe("guidepup-virtual-screen-reader");
  });
});

describe("cookie banner shown (index.html without the query parameter)", () => {
  it("buggy shop reports exactly BF-008, listing Accept and Reject", async () => {
    const outcome = await scanDemoPage(buggyServer, "index.html", true);
    expect(outcome.result.findings.map((finding) => finding.ruleId)).toEqual(["BF-008"]);
    const [overlayFinding] = outcome.result.findings;
    expect(await selectorsMatchExactly(outcome.result.url, [overlayFinding?.selector ?? ""], ".cookie-banner")).toBe(true);
    const controls = overlayFinding?.overlayControls?.map((control) => control.selector) ?? [];
    expect(await selectorsMatchExactly(outcome.result.url, controls, ".cookie-choice")).toBe(true);
    expect(outcome.result.notTested).toEqual([]);
  });

  it("accessible shop reports nothing", async () => {
    const outcome = await scanDemoPage(accessibleServer, "index.html", true);
    expect(outcome.result.findings).toEqual([]);
    expect(outcome.result.notTested).toEqual([]);
  });
});
