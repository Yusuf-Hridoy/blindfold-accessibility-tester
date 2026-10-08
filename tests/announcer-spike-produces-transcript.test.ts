import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDemoSiteServer, type RunningDemoSiteServer } from "../demo-sites/serve-demo-sites.ts";
import { runAnnouncerSpike, type AnnouncerSpikeResult } from "../spikes/announcer-spike.ts";

describe("announcer spike on the buggy shop home page", () => {
  let server: RunningDemoSiteServer;
  let result: AnnouncerSpikeResult;

  beforeAll(async () => {
    server = await startDemoSiteServer({ shop: "buggy", port: 0 });
    result = await runAnnouncerSpike({ pageUrl: `${server.url}/?no-cookie-banner=1` });
  });

  afterAll(async () => {
    await server.close();
  });

  it("records at least 15 steps", () => {
    expect(result.steps.length).toBeGreaterThanOrEqual(15);
  });

  it("announces the cart button without a name in at least one engine (BF-002)", () => {
    const cartButtonStep = result.steps.find((step) => step.element.startsWith("button.cart-button"));
    expect(cartButtonStep).toBeDefined();
    const announcedWithoutName = cartButtonStep?.engineA === "button" || cartButtonStep?.engineB === "button";
    expect(announcedWithoutName).toBe(true);
  });

  it("finds at least one nav link with no visible focus indicator (BF-004)", () => {
    const navLinkSteps = result.steps.filter((step) => step.element.startsWith("a.nav-link"));
    expect(navLinkSteps.some((step) => step.focusVisible === false)).toBe(true);
  });
});
