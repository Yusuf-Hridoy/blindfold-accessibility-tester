import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installedPlaywrightVersion } from "../../src/browser/missing-browser-check.ts";
import { runBlindfoldCli } from "../helpers/run-blindfold-cli.ts";

describe("when Chromium isn't installed", () => {
  let emptyBrowserFolder: string;
  beforeAll(async () => {
    emptyBrowserFolder = await mkdtemp(path.join(tmpdir(), "blindfold-no-browsers-"));
  });
  afterAll(async () => {
    await rm(emptyBrowserFolder, { recursive: true, force: true });
  });

  it("exits 2 with the install command for Blindfold's own Playwright version", async () => {
    // Playwright looks for browsers here, and finds none.
    const run = await runBlindfoldCli(["scan", "http://localhost:4000/", "--no-audio", "--output", path.join(emptyBrowserFolder, "out")], {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: emptyBrowserFolder,
    });
    expect(run.exitCode).toBe(2);
    expect(run.stderr.trim()).toBe(`Chromium isn't installed. Run: npx playwright@${installedPlaywrightVersion()} install chromium`);
    expect(installedPlaywrightVersion()).toBe("1.64.0");
  });
});
