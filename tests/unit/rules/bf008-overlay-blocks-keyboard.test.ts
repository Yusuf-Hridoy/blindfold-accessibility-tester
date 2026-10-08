import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findingSelectors, startSnippetScanner, type SnippetScanner } from "../../helpers/scan-html-snippet.ts";

/** A full-screen overlay; the rest of the page is made inert. */
function fullScreenOverlay(controlsHtml: string): string {
  return `
    <main id="page" inert><a href="#a">Read more</a></main>
    <div id="overlay" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5)">
      <p>Cookies?</p>${controlsHtml}
    </div>
    <script>
      document.getElementById("overlay").addEventListener("click", () => document.getElementById("overlay").remove());
    </script>`;
}

const SPAN_BUTTONS = `<span id="accept" style="cursor: pointer">Accept</span> <span id="reject" style="cursor: pointer">Reject</span>`;

describe("BF-008 overlay blocks keyboard", () => {
  let scanner: SnippetScanner;

  beforeAll(async () => {
    scanner = await startSnippetScanner();
  });

  afterAll(async () => {
    await scanner.close();
  });

  it("fires for a full-screen overlay with span buttons over an inert page, listing the controls once", async () => {
    const outcome = await scanner.scan(fullScreenOverlay(SPAN_BUTTONS));
    expect(findingSelectors(outcome, "BF-008")).toEqual(["#overlay"]);
    const finding = outcome.result.findings.find((candidate) => candidate.ruleId === "BF-008");
    expect(finding?.overlayControls?.map((control) => control.selector)).toEqual(["#accept", "#reject"]);
    // The controls are reported under BF-008 only, not also as BF-001.
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
  });

  it("also fires at the start of a journey and blocks dismissing it", async () => {
    const outcome = await scanner.runJourney(fullScreenOverlay(SPAN_BUTTONS), [{ dismiss: "Accept, button" }]);
    expect(findingSelectors(outcome, "BF-008")).toEqual(["#overlay"]);
    expect(outcome.result.outcome).toBe("blocked");
    expect(outcome.result.blockedAtStep).toBe(1);
  });

  it("does not fire when the overlay has real buttons", async () => {
    const outcome = await scanner.scan(fullScreenOverlay(`<button>Accept</button> <button>Reject</button>`));
    expect(findingSelectors(outcome, "BF-008")).toEqual([]);
  });

  it("does not fire for a small bottom banner over a usable page: its span buttons are BF-001", async () => {
    const outcome = await scanner.scan(`
      <main><a href="#a">Read more</a></main>
      <div id="banner" style="position: fixed; left: 0; right: 0; bottom: 0; height: 60px; background: #eee">
        ${SPAN_BUTTONS}
      </div>`);
    expect(findingSelectors(outcome, "BF-008")).toEqual([]);
    expect(findingSelectors(outcome, "BF-001")).toEqual(["#accept", "#reject"]);
  });
});
