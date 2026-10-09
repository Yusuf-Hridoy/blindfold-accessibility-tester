import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDemoSiteServer } from "../../demo-sites/serve-demo-sites.ts";
import { launchBrowser } from "../../src/browser/browser-launcher.ts";
import { buildJsonReport } from "../../src/reports/json-report-builder.ts";
import { scanPage } from "../../src/scan/page-scanner.ts";
import { runBlindfoldCli } from "../helpers/run-blindfold-cli.ts";

let folder: string;
let buggyReport: string;
let accessibleReport: string;

/** Scans the cart page of one demo shop and writes its report.json. */
async function writeCartReport(shop: "buggy" | "accessible", fileName: string): Promise<string> {
  const server = await startDemoSiteServer({ shop, port: 0 });
  const browser = await launchBrowser();
  try {
    const { result } = await scanPage({ url: `${server.url}/cart.html?no-cookie-banner=1`, browser, maxTabs: 400, pageTimeoutSeconds: 30, screenshots: false });
    const filePath = path.join(folder, fileName);
    await writeFile(filePath, buildJsonReport(result));
    return filePath;
  } finally {
    await browser.close();
    await server.close();
  }
}

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "blindfold-compare-test-"));
  [buggyReport, accessibleReport] = await Promise.all([writeCartReport("buggy", "buggy.json"), writeCartReport("accessible", "accessible.json")]);
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("blindfold compare", () => {
  it("exits 0 when every barrier was fixed (buggy → accessible cart), and writes both files", async () => {
    const output = path.join(folder, "fixed");
    const run = await runBlindfoldCli(["compare", buggyReport, accessibleReport, "--output", output]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("Blindfold 0.4.0 · compare");
    expect(run.stdout).toContain("✓ 6 fixed    ✗ 0 new    • 0 still present");
    // Different ports, so a warning, but the comparison still runs.
    expect(run.stdout).toContain("! The reports are for different pages:");
    const comparison = JSON.parse(await readFile(path.join(output, "comparison.json"), "utf8")) as { totals: unknown };
    expect(comparison.totals).toEqual({ fixed: 6, new: 0, stillPresent: 0 });
    await access(path.join(output, "comparison.html"));
  });

  it("exits 1 and lists each new barrier (accessible → buggy cart)", async () => {
    const run = await runBlindfoldCli(["compare", accessibleReport, buggyReport, "--output", path.join(folder, "new")]);
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toContain("✓ 0 fixed    ✗ 6 new    • 0 still present");
    expect(run.stdout).toContain('  ✗ new  BF-001  Control can\'t be reached by keyboard: div.checkout-button "Checkout"');
    expect(run.stdout).toContain("  ✗ new  BF-002  Control has no accessible name: button.cart-button");
  });

  it("exits 0 with everything still present when comparing a report with itself", async () => {
    const run = await runBlindfoldCli(["compare", buggyReport, buggyReport, "--output", path.join(folder, "same")]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("✓ 0 fixed    ✗ 0 new    • 6 still present");
    expect(run.stdout).not.toContain("different pages");
  });

  it("exits 2 for a missing report", async () => {
    const missing = path.join(folder, "missing.json");
    const run = await runBlindfoldCli(["compare", missing, buggyReport, "--output", path.join(folder, "missing")]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain(`Report not found: ${missing}.`);
  });

  it("exits 2 when the report types differ", async () => {
    const journeyReport = path.join(folder, "journey.json");
    await writeFile(journeyReport, JSON.stringify({ journeyName: "Cart", steps: [], findings: [] }));
    const run = await runBlindfoldCli(["compare", buggyReport, journeyReport, "--output", path.join(folder, "mixed")]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("Can't compare a scan report with a journey report.");
  });
});
