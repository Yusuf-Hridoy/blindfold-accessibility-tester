import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Page } from "playwright";
import { detectOverlays } from "../../src/overlays/blocking-overlay-detector.ts";
import { startSnippetScanner, type SnippetScanner } from "../helpers/scan-html-snippet.ts";

async function idsOf(page: Page, selectors: string[]): Promise<number[]> {
  return page.evaluate(
    (all) => all.map((selector) => window.__blindfoldElements.idFor(document.querySelector(selector) as Element)),
    selectors,
  );
}

describe("detectOverlays", () => {
  let scanner: SnippetScanner;

  beforeAll(async () => {
    scanner = await startSnippetScanner();
  });

  afterAll(async () => {
    await scanner.close();
  });

  it("groups controls under their outermost positioned container and measures how it blocks the page", async () => {
    const page = await scanner.open(`
      <main inert><a id="link" href="#a">Read more</a></main>
      <div id="overlay" style="position: fixed; inset: 0">
        <div style="position: absolute; top: 10px"><span id="accept">Accept</span></div>
      </div>`);
    const [overlay] = await detectOverlays(page, await idsOf(page, ["#accept"]));
    expect(overlay?.container.selector).toBe("#overlay");
    expect(overlay).toMatchObject({ viewportCoverage: 1, restOfPageBlocked: true, blocksPage: true });
    expect(overlay?.controls).toEqual([expect.objectContaining({ selector: "#accept", keyboardReachable: false })]);
  });

  it("treats a small banner over a usable page as not blocking", async () => {
    const page = await scanner.open(`
      <main><a href="#a">Read more</a></main>
      <div id="banner" style="position: fixed; bottom: 0; left: 0; width: 300px; height: 60px"><button id="ok">OK</button></div>`);
    const [banner] = await detectOverlays(page, await idsOf(page, ["#ok"]));
    expect(banner?.blocksPage).toBe(false);
    expect(banner?.restOfPageBlocked).toBe(false);
    expect(banner?.viewportCoverage).toBeLessThan(0.25);
  });

  it("decides keyboard reachability statically", async () => {
    const page = await scanner.open(`
      <div id="overlay" style="position: fixed; inset: 0">
        <button id="plain">Plain</button>
        <span id="span-with-tabindex" tabindex="0">Span with tabindex</span>
        <button id="disabled" disabled>Disabled</button>
        <div inert><button id="inert-child">Inert child</button></div>
        <div hidden><button id="hidden-child">Hidden child</button></div>
        <details><summary id="summary">More</summary><button id="closed-details-child">Inside closed details</button></details>
        <span id="plain-span">Plain span</span>
      </div>`);
    const selectors = ["#plain", "#span-with-tabindex", "#disabled", "#inert-child", "#hidden-child", "#summary", "#closed-details-child", "#plain-span"];
    const [overlay] = await detectOverlays(page, await idsOf(page, selectors));
    const reachable = Object.fromEntries(overlay?.controls.map((control) => [control.selector, control.keyboardReachable]) ?? []);
    expect(reachable).toEqual({
      "#plain": true,
      "#span-with-tabindex": true,
      "#disabled": false,
      "#inert-child": false,
      "#hidden-child": false,
      "#summary": true,
      "#closed-details-child": false,
      "#plain-span": false,
    });
  });
});
