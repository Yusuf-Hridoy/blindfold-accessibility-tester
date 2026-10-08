import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findingSelectors, startSnippetScanner, type SnippetScanner } from "../../helpers/scan-html-snippet.ts";

/** A button that shows a hidden role="dialog"; `afterOpen` runs right after. */
function pageWithDialog(afterOpen: string): string {
  return `
    <button id="open">Open help</button>
    <div id="help" role="dialog" aria-modal="true" aria-labelledby="help-heading" hidden>
      <h2 id="help-heading" tabindex="-1">Help</h2>
      <button>Close</button>
    </div>
    <script>
      document.getElementById("open").addEventListener("click", () => {
        document.getElementById("help").hidden = false;
        ${afterOpen}
      });
    </script>`;
}

describe("BF-007 modal without focus", () => {
  let scanner: SnippetScanner;

  beforeAll(async () => {
    scanner = await startSnippetScanner();
  });

  afterAll(async () => {
    await scanner.close();
  });

  it("fires when a dialog opens without moving focus", async () => {
    const outcome = await scanner.runJourney(pageWithDialog(""), [{ reach: "Open help, button", press: "Enter" }]);
    expect(findingSelectors(outcome, "BF-007")).toEqual(["#help"]);
  });

  it("reports one finding when expect_focus_inside also names the dialog", async () => {
    const outcome = await scanner.runJourney(pageWithDialog(""), [
      { reach: "Open help, button", press: "Enter", expectFocusInside: "Help" },
    ]);
    expect(findingSelectors(outcome, "BF-007")).toEqual(["#help"]);
    expect(outcome.result.steps[0]?.expectationFailures).toEqual([]);
  });

  it("does not fire when focus moves to the dialog heading", async () => {
    const outcome = await scanner.runJourney(pageWithDialog(`document.getElementById("help-heading").focus();`), [
      { reach: "Open help, button", press: "Enter", expectFocusInside: "Help" },
    ]);
    expect(outcome.result.findings).toEqual([]);
    expect(outcome.result.outcome).toBe("passed");
  });

  it("does not fire for a <dialog> opened with showModal()", async () => {
    const outcome = await scanner.runJourney(
      `
      <button id="open">Open help</button>
      <dialog id="help" aria-labelledby="help-heading"><h2 id="help-heading">Help</h2><button>Close</button></dialog>
      <script>document.getElementById("open").addEventListener("click", () => document.getElementById("help").showModal());</script>`,
      [{ reach: "Open help, button", press: "Enter", expectFocusInside: "Help" }],
    );
    expect(outcome.result.findings).toEqual([]);
  });
});
