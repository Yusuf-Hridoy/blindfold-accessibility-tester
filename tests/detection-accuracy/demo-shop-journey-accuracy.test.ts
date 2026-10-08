// The journey benchmark: the three example journeys against both demo shops.
// buggy-shop must produce exactly these barriers, per step; accessible-shop none.
// Effort numbers are deterministic on the demo shops, so they are locked in too.

import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { startDemoSiteServer, type RunningDemoSiteServer } from "../../demo-sites/serve-demo-sites.ts";
import { launchBrowser } from "../../src/browser/browser-launcher.ts";
import { loadJourneyFile } from "../../src/journeys/journey-file-loader.ts";
import { runJourney, type JourneyRunOutcome } from "../../src/journeys/journey-runner.ts";
import type { JourneyOutcome, JourneyStepStatus } from "../../src/types/journey-result-types.ts";
import type { RuleId } from "../../src/types/scan-result-types.ts";

const JOURNEY_FOLDER = path.join(import.meta.dirname, "..", "..", "example-journeys");

interface ExpectedStep {
  status: JourneyStepStatus;
  /** Each rule on this step, and a CSS selector for exactly the elements it must report. */
  findings: Partial<Record<RuleId, string>>;
  expectationFailures: string[];
}

interface ExpectedJourney {
  outcome: JourneyOutcome;
  blockedAtStep: number | null;
  steps: ExpectedStep[];
  /** Where an accessible journey ends. */
  finalPath?: string;
  /** BF-008 only: CSS selector for exactly the overlay's controls. */
  overlayControls?: string;
  effort: { keyboardPresses: number; mouseClicks: number; ratio: number; untilBlocked: boolean; perStep: number[] };
}

const passed = (findings: Partial<Record<RuleId, string>> = {}): ExpectedStep => ({
  status: Object.keys(findings).length > 0 ? "passed-with-barriers" : "passed",
  findings,
  expectationFailures: [],
});

const JOURNEYS: Record<string, { file: string; buggy: ExpectedJourney; accessible: ExpectedJourney }> = {
  product: {
    file: "buggy-shop-product-journey.yaml",
    buggy: {
      outcome: "completed-with-barriers",
      blockedAtStep: null,
      steps: [
        passed({ "BF-002": ".cart-button", "BF-004": ".nav-link", "BF-005": ".cart-message" }),
        passed({ "BF-007": ".size-guide-panel" }),
        { status: "passed-with-barriers", findings: {}, expectationFailures: ["expect_closed"] },
      ],
      effort: { keyboardPresses: 12, mouseClicks: 3, ratio: 4, untilBlocked: false, perStep: [9, 2, 1] },
    },
    accessible: {
      outcome: "passed",
      blockedAtStep: null,
      steps: [passed(), passed(), passed()],
      finalPath: "/product-linen-tote-bag.html",
      effort: { keyboardPresses: 12, mouseClicks: 3, ratio: 4, untilBlocked: false, perStep: [9, 2, 1] },
    },
  },
  cart: {
    file: "buggy-shop-cart-journey.yaml",
    buggy: {
      outcome: "blocked",
      blockedAtStep: 2,
      steps: [
        passed({ "BF-002": ".cart-button", "BF-004": ".nav-link", "BF-006": '.cart-item[data-item-id="linen-tote-bag"] .remove-button' }),
        { status: "failed", findings: { "BF-001": ".checkout-button" }, expectationFailures: [] },
      ],
      effort: { keyboardPresses: 19, mouseClicks: 2, ratio: 9.5, untilBlocked: true, perStep: [9, 10] },
    },
    accessible: {
      outcome: "passed",
      blockedAtStep: null,
      steps: [passed(), passed()],
      finalPath: "/checkout.html",
      effort: { keyboardPresses: 11, mouseClicks: 2, ratio: 5.5, untilBlocked: false, perStep: [9, 2] },
    },
  },
  "cookie banner": {
    file: "buggy-shop-cookie-banner-journey.yaml",
    buggy: {
      outcome: "blocked",
      blockedAtStep: 1,
      steps: [
        { status: "failed", findings: { "BF-008": ".cookie-banner" }, expectationFailures: [] },
        { status: "not-run", findings: {}, expectationFailures: [] },
      ],
      overlayControls: ".cookie-choice",
      effort: { keyboardPresses: 2, mouseClicks: 1, ratio: 2, untilBlocked: true, perStep: [2] },
    },
    accessible: {
      outcome: "passed",
      blockedAtStep: null,
      steps: [passed(), passed()],
      finalPath: "/product-linen-tote-bag.html",
      effort: { keyboardPresses: 3, mouseClicks: 2, ratio: 1.5, untilBlocked: false, perStep: [1, 2] },
    },
  },
};

let browser: Browser;
const servers = {} as Record<"buggy" | "accessible", RunningDemoSiteServer>;

beforeAll(async () => {
  browser = await launchBrowser();
  servers.buggy = await startDemoSiteServer({ shop: "buggy", port: 0 });
  servers.accessible = await startDemoSiteServer({ shop: "accessible", port: 0 });
});

afterAll(async () => {
  await browser.close();
  await servers.buggy.close();
  await servers.accessible.close();
});

async function runExampleJourney(file: string, shop: "buggy" | "accessible"): Promise<JourneyRunOutcome> {
  const journey = await loadJourneyFile(path.join(JOURNEY_FOLDER, file), servers[shop].url);
  return runJourney({ journey, browser, maxTabsPerStep: 100, pageTimeoutSeconds: 30, screenshots: false });
}

/** True when the reported selectors point at exactly the elements the expected selector matches, on a fresh load. */
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

async function expectJourneyToMatch(outcome: JourneyRunOutcome, expected: ExpectedJourney): Promise<void> {
  const { result } = outcome;
  expect(result.engine.name).toBe("guidepup-virtual-screen-reader");
  expect(result.outcome).toBe(expected.outcome);
  expect(result.blockedAtStep).toBe(expected.blockedAtStep);
  expect(result.steps.map((step) => step.status)).toEqual(expected.steps.map((step) => step.status));

  for (const [index, expectedStep] of expected.steps.entries()) {
    const stepNumber = index + 1;
    const stepFindings = result.findings.filter((finding) => finding.journeyStep === stepNumber);
    const reportedRules = [...new Set(stepFindings.map((finding) => finding.ruleId))].sort();
    expect(reportedRules, `rules on step ${stepNumber}`).toEqual(Object.keys(expectedStep.findings).sort());

    for (const [ruleId, expectedSelector] of Object.entries(expectedStep.findings)) {
      const reported = stepFindings.filter((finding) => finding.ruleId === ruleId).map((finding) => finding.selector);
      const matches = await selectorsMatchExactly(result.startUrl, reported, expectedSelector);
      expect(matches, `${ruleId} on step ${stepNumber}: reported ${reported.join(", ")}`).toBe(true);
    }
    const failures = result.steps[index]?.expectationFailures.map((failure) => failure.expectation) ?? [];
    expect(failures, `expectation failures on step ${stepNumber}`).toEqual(expectedStep.expectationFailures);
  }

  if (expected.overlayControls) {
    const controls = result.findings.find((finding) => finding.ruleId === "BF-008")?.overlayControls?.map((control) => control.selector) ?? [];
    expect(await selectorsMatchExactly(result.startUrl, controls, expected.overlayControls)).toBe(true);
  }
  if (expected.finalPath) expect(new URL(result.finalUrl).pathname).toBe(expected.finalPath);

  expect(result.effort).toMatchObject({
    keyboardPresses: expected.effort.keyboardPresses,
    mouseClicks: expected.effort.mouseClicks,
    ratio: expected.effort.ratio,
    untilBlocked: expected.effort.untilBlocked,
  });
  expect(result.effort.perStep.map((step) => step.keyboardPresses)).toEqual(expected.effort.perStep);
}

for (const [journeyName, journey] of Object.entries(JOURNEYS)) {
  describe(`${journeyName} journey`, () => {
    it("buggy shop: exactly the expected barriers, per step, and effort", async () => {
      await expectJourneyToMatch(await runExampleJourney(journey.file, "buggy"), journey.buggy);
    });

    it("accessible shop: passes with no findings, and effort", async () => {
      const outcome = await runExampleJourney(journey.file, "accessible");
      expect(outcome.result.findings).toEqual([]);
      await expectJourneyToMatch(outcome, journey.accessible);
    });
  });
}
