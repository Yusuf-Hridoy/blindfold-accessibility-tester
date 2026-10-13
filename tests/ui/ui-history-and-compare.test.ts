// History lists past runs newest first; Compare reuses `blindfold compare`.
// Buggy cart, then accessible cart: every barrier of the first run is fixed.

import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDemoSiteServer, type RunningDemoSiteServer } from "../../demo-sites/serve-demo-sites.ts";
import type { ScanResult } from "../../src/types/scan-result-types.ts";
import { REPORT_CSP } from "../../src/ui/ui-request-security.ts";
import type { HistoryEntry } from "../../src/ui/ui-results-history.ts";
import type { RunningUiServer } from "../../src/ui/ui-server.ts";
import { apiCall, startRun, startTestUiServer, uiRequest } from "../helpers/ui-test-client.ts";

let server: RunningUiServer;
let resultsFolder: string;
let buggyShop: RunningDemoSiteServer;
let accessibleShop: RunningDemoSiteServer;

beforeAll(async () => {
  ({ server, resultsFolder } = await startTestUiServer());
  buggyShop = await startDemoSiteServer({ shop: "buggy", port: 0 });
  accessibleShop = await startDemoSiteServer({ shop: "accessible", port: 0 });
});

afterAll(async () => {
  await server.close();
  await buggyShop.close();
  await accessibleShop.close();
  await rm(resultsFolder, { recursive: true, force: true });
});

async function scan(url: string): Promise<string> {
  const { runId, events } = await startRun(server, "/api/scans", { url, viewport: "desktop", audio: false });
  expect((await events.waitForEnd()).type).toBe("run-finished");
  return runId;
}

describe("history and compare", () => {
  it("lists both runs newest first, and the comparison reports the buggy cart's barriers as fixed", async () => {
    const buggyUrl = `${buggyShop.url}/cart.html?no-cookie-banner=1`;
    const accessibleUrl = `${accessibleShop.url}/cart.html?no-cookie-banner=1`;
    const buggyRun = await scan(buggyUrl);
    const accessibleRun = await scan(accessibleUrl);

    const history = JSON.parse((await apiCall(server, "GET", "/api/history")).body) as { runs: HistoryEntry[]; running: boolean };
    expect(history.running).toBe(false);
    expect(history.runs.map((run) => run.id)).toEqual([accessibleRun, buggyRun]);
    expect(history.runs.map((run) => [run.kind, run.subject, run.barrierCount])).toEqual([
      ["scan", accessibleUrl, 0],
      ["scan", buggyUrl, 6],
    ]);
    expect(history.runs[1]?.reportUrl).toBe(`/results/${buggyRun}/report.html`);

    const sameRun = await apiCall(server, "POST", "/api/compare", { oldRunId: buggyRun, newRunId: buggyRun });
    expect(sameRun.status).toBe(400);
    const notARun = await apiCall(server, "POST", "/api/compare", { oldRunId: "../..", newRunId: accessibleRun });
    expect(notARun.status).toBe(400);

    const response = await apiCall(server, "POST", "/api/compare", { oldRunId: buggyRun, newRunId: accessibleRun });
    expect(response.status).toBe(200);
    const comparison = JSON.parse(response.body) as { totals: { fixed: number; new: number; stillPresent: number }; fixed: string[]; verdict: string; comparisonUrl: string };
    const buggyReport = JSON.parse(await readFile(path.join(resultsFolder, buggyRun, "report.json"), "utf8")) as ScanResult;
    expect(comparison.totals).toEqual({ fixed: buggyReport.findings.length, new: 0, stillPresent: 0 });
    expect(comparison.fixed.some((line) => line.startsWith("BF-001") && line.includes("checkout-button"))).toBe(true);
    expect(comparison.verdict).toBe("No new barriers");

    const page = await uiRequest(server.port, { path: `${comparison.comparisonUrl}?token=${server.token}` });
    expect(page.status).toBe(200);
    expect(page.headers["content-security-policy"]).toBe(REPORT_CSP);
    expect(page.body).toContain("No new barriers");

    // Comparisons live in the results folder but are not runs.
    const historyAfter = JSON.parse((await apiCall(server, "GET", "/api/history")).body) as { runs: HistoryEntry[] };
    expect(historyAfter.runs).toHaveLength(2);
  });
});
