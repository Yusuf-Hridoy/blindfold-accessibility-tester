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

  const reasons = (outcome: Awaited<ReturnType<SnippetScanner["scan"]>>) =>
    outcome.result.findings.filter((finding) => finding.ruleId === "BF-002").map((finding) => finding.reason);

  it("fires as missing-name for an icon-only button with no label", async () => {
    const outcome = await scanner.scan(
      `<button id="icon"><svg aria-hidden="true" width="16" height="16"><circle cx="8" cy="8" r="6"/></svg></button>`,
    );
    expect(findingSelectors(outcome, "BF-002")).toEqual(["#icon"]);
    expect(reasons(outcome)).toEqual(["missing-name"]);
  });

  it("fires as missing-name for an unlabeled input", async () => {
    const outcome = await scanner.scan(`<input id="bare" type="text">`);
    expect(findingSelectors(outcome, "BF-002")).toEqual(["#bare"]);
    expect(reasons(outcome)).toEqual(["missing-name"]);
  });

  it("fires as hidden-from-screen-readers for a labelled button inside an aria-hidden div", async () => {
    const outcome = await scanner.scan(`
      <div aria-hidden="true"><button id="close" aria-label="Close dialog">×</button></div>`);
    expect(findingSelectors(outcome, "BF-002")).toEqual(["#close"]);
    expect(reasons(outcome)).toEqual(["hidden-from-screen-readers"]);
  });

  it("fires as hidden-from-screen-readers for a button that is itself aria-hidden", async () => {
    const outcome = await scanner.scan(`<button id="self-hidden" aria-hidden="true">Save</button>`);
    expect(findingSelectors(outcome, "BF-002")).toEqual(["#self-hidden"]);
    expect(reasons(outcome)).toEqual(["hidden-from-screen-readers"]);
  });

  it("does not fire for a labelled button with role none, which Chromium still announces", async () => {
    const outcome = await scanner.scan(`<button id="role-none" role="none" aria-label="Close">×</button>`);
    expect(outcome.result.focusStops[0]).toMatchObject({ role: "button", accessibleName: "Close", hiddenFromScreenReaders: false });
    expect(findingSelectors(outcome, "BF-002")).toEqual([]);
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
