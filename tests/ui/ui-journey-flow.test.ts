// A journey started from the web UI gives the same result as the journey
// benchmark: the buggy cart journey is blocked at step 2 by BF-001.

import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDemoSiteServer, type RunningDemoSiteServer } from "../../demo-sites/serve-demo-sites.ts";
import type { JourneyResult } from "../../src/types/journey-result-types.ts";
import type { RunningUiServer } from "../../src/ui/ui-server.ts";
import { startRun, startTestUiServer } from "../helpers/ui-test-client.ts";

let server: RunningUiServer;
let resultsFolder: string;
let demoShop: RunningDemoSiteServer;

beforeAll(async () => {
  ({ server, resultsFolder } = await startTestUiServer());
  demoShop = await startDemoSiteServer({ shop: "buggy", port: 0 });
});

afterAll(async () => {
  await server.close();
  await demoShop.close();
  await rm(resultsFolder, { recursive: true, force: true });
});

describe("journey from the web UI", () => {
  it("runs the buggy cart journey with live steps and matches the benchmark", async () => {
    const { runId, events } = await startRun(server, "/api/journeys", { file: "buggy-shop-cart-journey.yaml", baseUrl: demoShop.url, audio: false });
    const end = await events.waitForEnd();
    expect(end.type).toBe("run-finished");

    const steps = events.events.filter((event) => event.type === "step-started" || event.type === "step-finished");
    expect(steps.map((event) => `${event.type} ${event.stepNumber}`)).toEqual(["step-started 1", "step-finished 1", "step-started 2", "step-finished 2"]);
    expect(events.events.some((event) => event.type === "focus-stop" && event.journeyStep === 1)).toBe(true);

    const report = JSON.parse(await readFile(path.join(resultsFolder, runId, "report.json"), "utf8")) as JourneyResult;
    expect(report.outcome).toBe("blocked");
    expect(report.blockedAtStep).toBe(2);
    expect(report.steps.map((step) => step.status)).toEqual(["passed-with-barriers", "failed"]);
    const rulesOnStep = (step: number): string[] => report.findings.filter((finding) => finding.journeyStep === step).map((finding) => finding.ruleId);
    expect(new Set(rulesOnStep(1))).toEqual(new Set(["BF-002", "BF-004", "BF-006"]));
    expect(rulesOnStep(2)).toEqual(["BF-001"]);
    expect(report.findings.find((finding) => finding.ruleId === "BF-001")?.description).toBe('div.checkout-button "Checkout"');
    expect(report.effort).toMatchObject({ keyboardPresses: 19, mouseClicks: 2, ratio: 9.5, untilBlocked: true });

    const findingEvents = events.events.filter((event) => event.type === "finding");
    expect(findingEvents).toHaveLength(report.findings.length);
    if (end.type === "run-finished") {
      expect(end.summary).toMatchObject({ kind: "journey", subject: report.journeyName, outcome: "blocked", verdict: "Journey blocked at step 2" });
    }
  });
});
