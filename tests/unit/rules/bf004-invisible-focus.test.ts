import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findingSelectors, startSnippetScanner, type SnippetScanner } from "../../helpers/scan-html-snippet.ts";

describe("BF-004 invisible focus", () => {
  let scanner: SnippetScanner;

  beforeAll(async () => {
    scanner = await startSnippetScanner();
  });

  afterAll(async () => {
    await scanner.close();
  });

  it("fires for outline: none with nothing else", async () => {
    const outcome = await scanner.scan(`<style>#plain:focus { outline: none; }</style><button id="plain">Plain</button>`);
    expect(findingSelectors(outcome, "BF-004")).toEqual(["#plain"]);
  });

  it("does not fire for a focus ring drawn with ::after", async () => {
    const outcome = await scanner.scan(`
      <style>
        #ring { position: relative; outline: none; }
        #ring:focus::after { content: ""; position: absolute; inset: -4px; border: 2px solid blue; }
      </style>
      <button id="ring">Ring</button>`);
    expect(outcome.result.focusStops[0]?.focusVisible).toBe(true);
    expect(findingSelectors(outcome, "BF-004")).toEqual([]);
  });

  it("does not fire for a focus ring on the parent via :focus-within", async () => {
    const outcome = await scanner.scan(`
      <style>
        .field input { outline: none; }
        .field:focus-within { box-shadow: 0 0 0 3px blue; }
      </style>
      <div class="field"><input id="inner" aria-label="Name"></div>`);
    expect(outcome.result.focusStops[0]?.focusVisible).toBe(true);
    expect(findingSelectors(outcome, "BF-004")).toEqual([]);
  });

  it("does not fire for a box-shadow focus style", async () => {
    const outcome = await scanner.scan(
      `<style>#shadow:focus { outline: none; box-shadow: 0 0 0 3px blue; }</style><button id="shadow">Shadow</button>`,
    );
    expect(outcome.result.focusStops[0]?.focusVisible).toBe(true);
    expect(findingSelectors(outcome, "BF-004")).toEqual([]);
  });

  it("uses the MutationObserver baseline for an element added after load", async () => {
    // The new button is inserted when the first button gets focus, after the
    // page-load baselines were taken, and has a proper focus style.
    const outcome = await scanner.scan(`
      <style>.late { outline: none; } .late:focus { box-shadow: 0 0 0 3px blue; }</style>
      <button id="first">First</button>
      <main><section><div id="slot"></div></section></main>
      <script>
        document.getElementById("first").addEventListener("focus", () => {
          if (document.querySelector(".late")) return;
          const late = document.createElement("button");
          late.className = "late";
          late.id = "late";
          late.textContent = "Added later";
          document.getElementById("slot").append(late);
        });
      </script>`);
    const lateStop = outcome.result.focusStops.find((stop) => stop.selector === "#late");
    expect(lateStop?.focusVisible).toBe(true);
    expect(findingSelectors(outcome, "BF-004")).toEqual([]);
  });
});
