import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neverReachedHint } from "../../src/journeys/never-reached-messages.ts";
import { startSnippetScanner, type SnippetScanner } from "../helpers/scan-html-snippet.ts";

describe("neverReachedHint", () => {
  it("inside a confined modal: says which dialog, and to close it first", () => {
    expect(neverReachedHint({ neverReachedBecause: "confined", confinedIn: { isDialog: true, name: "Cookies" }, closestMatches: ["Accept, button"] })).toBe(
      'Focus is inside the "Cookies" dialog. Close it first (for example, press: Escape).',
    );
    expect(neverReachedHint({ neverReachedBecause: "confined", confinedIn: { isDialog: true, name: "" } })).toBe(
      "Focus is inside a dialog with no name. Close it first (for example, press: Escape).",
    );
    expect(neverReachedHint({ neverReachedBecause: "confined", confinedIn: { isDialog: false, name: "Menu" } })).toBe(
      'Focus is kept inside "Menu" (the rest of the page is inert). Close it first (for example, press: Escape).',
    );
  });

  it("after a trap: no hint, the BF-003 finding explains it", () => {
    expect(neverReachedHint({ neverReachedBecause: "trap", closestMatches: ["Subscribe, button"] })).toBeNull();
  });

  it("after an ordinary full Tab cycle (or the Tab limit): Did you mean", () => {
    expect(neverReachedHint({ neverReachedBecause: "full-cycle", closestMatches: ["Checkout, link", "Cart, link"] })).toBe('Did you mean "Checkout, link"?');
    expect(neverReachedHint({ neverReachedBecause: "max-tabs", closestMatches: ["Cart, link"] })).toBe('Did you mean "Cart, link"?');
    expect(neverReachedHint({ neverReachedBecause: "full-cycle", closestMatches: [] })).toBeNull();
  });
});

describe("the hint a real journey gets", () => {
  let scanner: SnippetScanner;
  beforeAll(async () => {
    scanner = await startSnippetScanner();
  });
  afterAll(async () => {
    await scanner.close();
  });

  it("confined in a named modal dialog", async () => {
    const { result } = await scanner.runJourney(
      `<main inert><a href="#">Home</a></main>
       <div role="dialog" aria-modal="true" aria-label="Cookies"><button id="accept">Accept</button><button id="reject">Reject</button></div>
       <script>
         // The standard ARIA modal pattern: Tab wraps around inside the dialog.
         document.getElementById("reject").addEventListener("keydown", (event) => {
           if (event.key === "Tab" && !event.shiftKey) {
             event.preventDefault();
             document.getElementById("accept").focus();
           }
         });
         document.getElementById("accept").focus();
       </script>`,
      [{ reach: "Home, link", press: "Enter" }],
    );
    const [step] = result.steps;
    expect(step?.neverReachedBecause).toBe("confined");
    expect(step && neverReachedHint(step)).toBe('Focus is inside the "Cookies" dialog. Close it first (for example, press: Escape).');
  });

  it("trapped", async () => {
    const { result } = await scanner.runJourney(
      `<a href="#">Home</a><div id="box"><input aria-label="Email"><button id="join">Join</button></div>
       <script>
         document.getElementById("box").addEventListener("keydown", (event) => {
           if (event.key === "Tab" && !event.shiftKey && document.activeElement.id === "join") {
             event.preventDefault();
             document.querySelector("input").focus();
           }
         });
         document.querySelector("input").focus();
       </script>`,
      [{ reach: "Home, link", press: "Enter" }],
    );
    const [step] = result.steps;
    expect(step?.neverReachedBecause).toBe("trap");
    expect(step && neverReachedHint(step)).toBeNull();
  });

  it("an ordinary miss", async () => {
    const { result } = await scanner.runJourney(`<a href="#">Checkout</a><a href="#">Cart</a>`, [{ reach: "Checkout, button", press: "Enter" }]);
    const [step] = result.steps;
    expect(step?.neverReachedBecause).toBe("full-cycle");
    expect(step && neverReachedHint(step)).toBe('Did you mean "Checkout, link"?');
  });
});
