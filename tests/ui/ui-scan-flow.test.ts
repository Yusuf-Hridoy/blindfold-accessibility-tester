// A scan started from the web UI: live progress arrives (focus stops, then
// findings, then run-finished), and the report has the same findings as the
// CLI path (scanPage) and the benchmark for the buggy cart.

import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDemoSiteServer, type RunningDemoSiteServer } from "../../demo-sites/serve-demo-sites.ts";
import { scanPage } from "../../src/scan/page-scanner.ts";
import type { ProgressEvent } from "../../src/types/progress-event-types.ts";
import type { ScanResult } from "../../src/types/scan-result-types.ts";
import { REPORT_CSP, tokenCookieName } from "../../src/ui/ui-request-security.ts";
import type { RunningUiServer } from "../../src/ui/ui-server.ts";
import { startRun, startTestUiServer, uiRequest } from "../helpers/ui-test-client.ts";

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

function ofType<T extends ProgressEvent["type"]>(events: ProgressEvent[], type: T): Extract<ProgressEvent, { type: T }>[] {
  return events.filter((event): event is Extract<ProgressEvent, { type: T }> => event.type === type);
}

describe("scan from the web UI", () => {
  it("streams focus stops and findings, then writes the same report as the CLI", async () => {
    const url = `${demoShop.url}/cart.html?no-cookie-banner=1`;
    const { runId, events } = await startRun(server, "/api/scans", { url, viewport: "desktop", audio: false });
    const end = await events.waitForEnd();
    expect(end.type).toBe("run-finished");
    if (end.type !== "run-finished") return;

    const report = JSON.parse(await readFile(path.join(resultsFolder, runId, "report.json"), "utf8")) as ScanResult;
    const stream = events.events;
    expect(stream[0]?.type).toBe("run-started");
    expect(stream[1]).toEqual({ type: "page-loaded", url });
    expect(ofType(stream, "focus-stop").map((event) => event.element)).toEqual(report.focusStops.map((stop) => stop.description));
    expect(ofType(stream, "finding").map((event) => event.ruleId)).toEqual(report.findings.map((finding) => finding.ruleId));
    expect(stream.at(-1)).toBe(end);

    // The benchmark for the buggy cart: BF-001 .checkout-button, BF-002 .cart-button, BF-004 every .nav-link (4).
    const byRule = (ruleId: string): string[] => report.findings.filter((finding) => finding.ruleId === ruleId).map((finding) => finding.description);
    expect(new Set(report.findings.map((finding) => finding.ruleId))).toEqual(new Set(["BF-001", "BF-002", "BF-004"]));
    expect(byRule("BF-001")).toEqual(['div.checkout-button "Checkout"']);
    expect(byRule("BF-002")).toEqual(["button.cart-button"]);
    expect(byRule("BF-004")).toHaveLength(4);
    expect(byRule("BF-004").every((description) => description.startsWith("a.nav-link"))).toBe(true);

    // The CLI path finds exactly the same elements.
    const direct = await scanPage({ url, maxTabs: 400, pageTimeoutSeconds: 30, screenshots: false });
    const pairs = (findings: ScanResult["findings"]): string[] => findings.map((finding) => `${finding.ruleId} ${finding.selector}`);
    expect(pairs(report.findings)).toEqual(pairs(direct.result.findings));

    expect(end.summary).toMatchObject({ kind: "scan", subject: url, barrierCount: 6, rulesFailed: 3, focusStops: report.focusStops.length });
    expect(end.reportFolder).toBe(runId);
    expect(end.reportUrl).toBe(`/results/${runId}/report.html`);
    expect(end.audioUrl).toBeNull();

    const reportPage = await uiRequest(server.port, { path: end.reportUrl ?? "", headers: { Cookie: `${tokenCookieName(server.port)}=${server.token}` } });
    expect(reportPage.status).toBe(200);
    expect(reportPage.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(reportPage.headers["content-security-policy"]).toBe(REPORT_CSP);
    expect(reportPage.body).toContain("Control can&#39;t be reached by keyboard");
  });
});
