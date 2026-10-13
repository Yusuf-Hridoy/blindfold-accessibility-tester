// Where the keyboard walk starts: a page that focuses something at load (a
// cookie banner at the end of the DOM, an autofocus field, a heading) must
// still be walked all the way round, not stopped at the end of the page.
// Plus the safety net that warns when most clickable elements were never reached.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildHtmlReport } from "../../src/reports/html-report-builder.ts";
import { INCOMPLETE_WALK_WARNING } from "../../src/rules/incomplete-walk-warning.ts";
import type { ScanOutcome } from "../../src/scan/page-scanner.ts";
import { runBlindfoldCli } from "../helpers/run-blindfold-cli.ts";
import { startSnippetScanner, type SnippetScanner } from "../helpers/scan-html-snippet.ts";

let scanner: SnippetScanner;

beforeAll(async () => {
  scanner = await startSnippetScanner();
});

afterAll(async () => {
  await scanner.close();
});

function links(count: number, first = 1): string {
  return Array.from({ length: count }, (_, index) => `<p><a href="#link-${first + index}">Link ${first + index}</a></p>`).join("");
}

/** A cookie banner at the end of the DOM whose first button the page focuses at load. */
const COOKIE_BANNER_FOCUSED_AT_LOAD = `
  <div class="cookie-banner" role="region" aria-label="Cookies">
    <p>We use cookies.</p>
    <button id="accept">Accept</button>
    <button id="reject">Reject</button>
  </div>
  <script>document.getElementById("accept").focus();</script>`;

/** Mouse-only "links": clickable for a mouse, never reachable with Tab. */
function mouseOnlyItems(count: number): string {
  return Array.from({ length: count }, (_, index) => `<div class="mouse-only" style="cursor: pointer" onclick="void 0">Item ${index + 1}</div>`).join("");
}

function selectorsFor(outcome: ScanOutcome, ruleId: string): string[] {
  return outcome.result.findings.filter((finding) => finding.ruleId === ruleId).map((finding) => finding.selector);
}

describe("a walk that starts on an element focused at load", () => {
  it("cookie banner at the end of the DOM: wraps to the top and reaches all 12 controls (full cycle, 0 BF-001)", async () => {
    const outcome = await scanner.scan(`${links(10)}${COOKIE_BANNER_FOCUSED_AT_LOAD}`);
    const { result } = outcome;
    expect(result.focusStops[0]).toMatchObject({ step: 0, selector: "#accept" });
    expect(result.focusStops.map((stop) => stop.accessibleName)).toEqual([
      "Accept",
      "Reject",
      ...Array.from({ length: 10 }, (_, index) => `Link ${index + 1}`),
    ]);
    expect(result.stoppedBecause).toBe("cycle-complete");
    expect(selectorsFor(outcome, "BF-001")).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("autofocus field in the middle of the page: everything is reached (0 BF-001)", async () => {
    const outcome = await scanner.scan(`${links(5)}<p><label>Search <input id="search" autofocus></label></p>${links(5, 6)}`);
    const { result } = outcome;
    expect(result.focusStops[0]).toMatchObject({ step: 0, selector: "#search" });
    expect(result.focusStops).toHaveLength(11);
    expect(result.stoppedBecause).toBe("cycle-complete");
    expect(selectorsFor(outcome, "BF-001")).toEqual([]);
  });

  it("a heading focused at load that Tab never stops on: one full cycle, no false trap (0 BF-001, no BF-003)", async () => {
    const outcome = await scanner.scan(`${links(3)}<h1 id="title" tabindex="-1">Title</h1>${links(3, 4)}<script>document.getElementById("title").focus();</script>`);
    const { result } = outcome;
    expect(result.focusStops[0]).toMatchObject({ step: 0, selector: "#title" });
    expect(result.focusStops).toHaveLength(7);
    expect(result.stoppedBecause).toBe("cycle-complete");
    expect(selectorsFor(outcome, "BF-003")).toEqual([]);
    expect(selectorsFor(outcome, "BF-001")).toEqual([]);
  });
});

describe("the incomplete-walk warning", () => {
  it("6 of 10 links are mouse-only <div>s: 6 BF-001, findings kept, warning in the result, HTML report and terminal", async () => {
    const html = `${links(4)}${mouseOnlyItems(6)}`;
    const outcome = await scanner.scan(html);
    expect(selectorsFor(outcome, "BF-001")).toHaveLength(6);
    expect(outcome.result.warnings).toEqual([INCOMPLETE_WALK_WARNING]);
    expect(buildHtmlReport(outcome.result, new Map())).toContain(INCOMPLETE_WALK_WARNING);

    const outputFolder = await mkdtemp(path.join(tmpdir(), "blindfold-walk-warning-"));
    try {
      const run = await runBlindfoldCli(["scan", scanner.pageUrl(html), "--no-audio", "--no-screenshots", "--output", outputFolder]);
      expect(run.exitCode, run.stderr).toBe(1);
      expect(run.stdout).toContain(`! ${INCOMPLETE_WALK_WARNING}`);
      const report = JSON.parse(await readFile(path.join(outputFolder, "report.json"), "utf8")) as { warnings: string[] };
      expect(report.warnings).toEqual([INCOMPLETE_WALK_WARNING]);
    } finally {
      await rm(outputFolder, { recursive: true, force: true });
    }
  });

  it("exactly half unreached (5 of 10) is not more than half: no warning", async () => {
    const outcome = await scanner.scan(`${links(5)}${mouseOnlyItems(5)}`);
    expect(selectorsFor(outcome, "BF-001")).toHaveLength(5);
    expect(outcome.result.warnings).toEqual([]);
  });
});

describe("journeys that start with focus near the end of the page", () => {
  it("reach a link at the top by wrapping around (no BF-001)", async () => {
    const outcome = await scanner.runJourney(`${links(10)}${COOKIE_BANNER_FOCUSED_AT_LOAD}`, [{ reach: "Link 1, link" }]);
    expect(outcome.result.outcome).toBe("passed");
    expect(outcome.result.findings.filter((finding) => finding.ruleId === "BF-001")).toEqual([]);
    // Accept → Reject → end of the page → Link 1.
    expect(outcome.result.steps[0]?.keysPressed).toHaveLength(3);
  });

  it("call a missing target a full cycle only after going round the whole page", async () => {
    const outcome = await scanner.runJourney(`${links(10)}${COOKIE_BANNER_FOCUSED_AT_LOAD}`, [{ reach: "Missing thing, button" }]);
    const [step] = outcome.result.steps;
    expect(outcome.result.blockedAtStep).toBe(1);
    expect(step?.neverReachedBecause).toBe("full-cycle");
    expect(step?.focusStopsPassed).toBe(12);
  });
});
