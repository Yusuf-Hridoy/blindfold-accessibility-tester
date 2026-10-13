// onProgress only reports: a scan or journey with it gives the same report as
// one without (apart from the time it ran and how long it took).

import path from "node:path";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDemoSiteServer, type RunningDemoSiteServer } from "../../demo-sites/serve-demo-sites.ts";
import { launchBrowser } from "../../src/browser/browser-launcher.ts";
import { loadJourneyFile } from "../../src/journeys/journey-file-loader.ts";
import { runJourney } from "../../src/journeys/journey-runner.ts";
import { buildJsonReport } from "../../src/reports/json-report-builder.ts";
import { scanPage } from "../../src/scan/page-scanner.ts";
import type { ProgressEvent } from "../../src/types/progress-event-types.ts";
import { EXAMPLE_JOURNEYS_FOLDER } from "../helpers/ui-test-client.ts";

let browser: Browser;
let demoShop: RunningDemoSiteServer;

beforeAll(async () => {
  browser = await launchBrowser();
  demoShop = await startDemoSiteServer({ shop: "buggy", port: 0 });
});

afterAll(async () => {
  await browser.close();
  await demoShop.close();
});

/** report.json without the fields that differ between any two runs. */
function comparableReport(result: Parameters<typeof buildJsonReport>[0]): unknown {
  return JSON.parse(buildJsonReport(result), (key, value: unknown) => {
    if (key === "scannedAt" || key === "durationMilliseconds") return undefined;
    return value;
  });
}

describe("onProgress", () => {
  it("doesn't change a scan's report", async () => {
    const options = { url: `${demoShop.url}/index.html?no-cookie-banner=1`, browser, maxTabs: 400, pageTimeoutSeconds: 30, screenshots: false };
    const events: ProgressEvent[] = [];
    const withProgress = await scanPage({ ...options, onProgress: (event) => events.push(event) });
    const without = await scanPage(options);
    expect(comparableReport(withProgress.result)).toEqual(comparableReport(without.result));

    expect(events[0]?.type).toBe("run-started");
    expect(events.filter((event) => event.type === "focus-stop")).toHaveLength(withProgress.result.focusStops.length);
    expect(events.filter((event) => event.type === "finding")).toHaveLength(withProgress.result.findings.length);
  });

  it("doesn't change a journey's report", async () => {
    const journey = await loadJourneyFile(path.join(EXAMPLE_JOURNEYS_FOLDER, "buggy-shop-product-journey.yaml"), demoShop.url);
    const options = { journey, browser, maxTabsPerStep: 100, pageTimeoutSeconds: 30, screenshots: false };
    const events: ProgressEvent[] = [];
    const withProgress = await runJourney({ ...options, onProgress: (event) => events.push(event) });
    const without = await runJourney(options);
    expect(comparableReport(withProgress.result)).toEqual(comparableReport(without.result));

    expect(events.filter((event) => event.type === "step-finished")).toHaveLength(withProgress.result.steps.filter((step) => step.status !== "not-run").length);
    expect(events.filter((event) => event.type === "finding")).toHaveLength(withProgress.result.findings.length);
  });
});
