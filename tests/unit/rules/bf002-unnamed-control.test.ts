import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findingSelectors, startSnippetScanner, type SnippetScanner } from "../../helpers/scan-html-snippet.ts";

describe("BF-002 unnamed control", () => {
  let scanner: SnippetScanner;

  beforeAll(async () => {
    scanner = await startSnippetScanner();
  });

  afterAll(async () => {
    await scanner.close();
  });

  it("fires for an icon-only button with no label", async () => {
    const outcome = await scanner.scan(
      `<button id="icon"><svg aria-hidden="true" width="16" height="16"><circle cx="8" cy="8" r="6"/></svg></button>`,
    );
    expect(findingSelectors(outcome, "BF-002")).toEqual(["#icon"]);
  });

  it("fires for an unlabeled input", async () => {
    const outcome = await scanner.scan(`<input id="bare" type="text">`);
    expect(findingSelectors(outcome, "BF-002")).toEqual(["#bare"]);
  });

  it("does not fire for aria-label, aria-labelledby, visually hidden text or <label for>", async () => {
    const outcome = await scanner.scan(`
      <style>.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }</style>
      <button aria-label="Close"><svg aria-hidden="true" width="16" height="16"></svg></button>
      <span id="search-label">Search</span>
      <button aria-labelledby="search-label"><svg aria-hidden="true" width="16" height="16"></svg></button>
      <button><svg aria-hidden="true" width="16" height="16"></svg><span class="visually-hidden">Open menu</span></button>
      <label for="name">Name</label><input id="name" type="text">`);
    expect(outcome.result.focusStops).toHaveLength(4);
    expect(findingSelectors(outcome, "BF-002")).toEqual([]);
  });
});
