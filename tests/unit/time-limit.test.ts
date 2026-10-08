import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchBrowser } from "../../src/browser/browser-launcher.ts";
import { runWithTimeLimit, TimeLimitError } from "../../src/runtime/time-limit.ts";
import { scanPage } from "../../src/scan/page-scanner.ts";

describe("runWithTimeLimit", () => {
  let slowServer: Server;
  let slowUrl: string;

  beforeAll(async () => {
    // Accepts the request but never answers, like a hung site.
    slowServer = createServer(() => {});
    await new Promise<void>((resolve) => slowServer.listen(0, resolve));
    slowUrl = `http://localhost:${(slowServer.address() as AddressInfo).port}/`;
  });

  afterAll(async () => {
    slowServer.closeAllConnections();
    await new Promise<void>((resolve) => slowServer.close(() => resolve()));
  });

  it("stops a slow scan with TimeLimitError and closes the browser", async () => {
    const browser = await launchBrowser();
    const startedAt = Date.now();
    const scan = runWithTimeLimit(
      1,
      () => scanPage({ url: slowUrl, browser, maxTabs: 10, pageTimeoutSeconds: 30, screenshots: false }),
      () => browser.close(),
    );
    await expect(scan).rejects.toThrow(TimeLimitError);
    await expect(scan).rejects.toThrow("Blindfold stopped after 1 s (time limit). Raise --time-limit for very large pages.");
    expect(Date.now() - startedAt).toBeLessThan(5_000);
    expect(browser.isConnected()).toBe(false);
  });

  it("returns the result when the work finishes in time", async () => {
    let cleanedUp = false;
    const value = await runWithTimeLimit(5, async () => "done", async () => {
      cleanedUp = true;
    });
    expect(value).toBe("done");
    expect(cleanedUp).toBe(false);
  });
});
