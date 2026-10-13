// Dogfooding: Blindfold scans its own web UI and must find nothing, both on a
// fresh start and once History has a run in it.

import { rm } from "node:fs/promises";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDemoSiteServer, type RunningDemoSiteServer } from "../../demo-sites/serve-demo-sites.ts";
import { launchBrowser } from "../../src/browser/browser-launcher.ts";
import { scanPage, type ScanOutcome } from "../../src/scan/page-scanner.ts";
import type { RunningUiServer } from "../../src/ui/ui-server.ts";
import { startRun, startTestUiServer } from "../helpers/ui-test-client.ts";

let server: RunningUiServer;
let resultsFolder: string;
let browser: Browser;
let demoShop: RunningDemoSiteServer;

beforeAll(async () => {
  ({ server, resultsFolder } = await startTestUiServer());
  browser = await launchBrowser();
  demoShop = await startDemoSiteServer({ shop: "buggy", port: 0 });
});

afterAll(async () => {
  await server.close();
  await browser.close();
  await demoShop.close();
  await rm(resultsFolder, { recursive: true, force: true });
});

function scanUi(): Promise<ScanOutcome> {
  return scanPage({ url: server.url, browser, maxTabs: 400, pageTimeoutSeconds: 30, screenshots: false });
}

function describeFindings(outcome: ScanOutcome): string[] {
  return outcome.result.findings.map((finding) => `${finding.ruleId} ${finding.description}`);
}

describe("the web UI page", () => {
  it("has no barriers on a fresh start", async () => {
    const outcome = await scanUi();
    expect(describeFindings(outcome)).toEqual([]);
    expect(outcome.result.notTested).toEqual([]);
    // The forms are really there (the page's script ran and listed the journeys).
    const announcements = outcome.result.focusStops.map((stop) => stop.announcement);
    expect(announcements).toContain("button, Scan");
    expect(announcements).toContain("button, Run journey");
  });

  it("has no barriers with a run in History and the Compare form hidden", async () => {
    const { events } = await startRun(server, "/api/scans", { url: `${demoShop.url}/cart.html?no-cookie-banner=1`, viewport: "desktop", audio: false });
    await events.waitForEnd();
    const outcome = await scanUi();
    expect(describeFindings(outcome)).toEqual([]);
    expect(outcome.result.focusStops.some((stop) => stop.role === "link" && /\d/.test(stop.accessibleName))).toBe(true);
  });

  it("has no barriers with two runs, so the Compare form is shown", async () => {
    const { events } = await startRun(server, "/api/scans", { url: `${demoShop.url}/index.html?no-cookie-banner=1`, viewport: "mobile", audio: false });
    await events.waitForEnd();
    const outcome = await scanUi();
    expect(describeFindings(outcome)).toEqual([]);
    expect(outcome.result.focusStops.map((stop) => stop.announcement)).toContain("button, Compare");
  });
});
