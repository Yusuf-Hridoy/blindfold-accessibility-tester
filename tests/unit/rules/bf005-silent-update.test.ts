import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findingSelectors, startSnippetScanner, type SnippetScanner } from "../../helpers/scan-html-snippet.ts";

/** A button that writes "Item added to cart." into `messageHtml` 100 ms after it's pressed. */
function pageWithMessage(messageHtml: string, afterWrite = ""): string {
  return `
    <button id="add">Add</button>
    ${messageHtml}
    <script>
      document.getElementById("add").addEventListener("click", () => {
        setTimeout(() => {
          const message = document.getElementById("message");
          message.textContent = "Item added to cart.";
          ${afterWrite}
        }, 100);
      });
    </script>`;
}

const ADD_AND_EXPECT = [{ reach: "Add, button", press: "Enter" as const, expectAnnouncement: "added to cart" }];

describe("BF-005 silent update", () => {
  let scanner: SnippetScanner;

  beforeAll(async () => {
    scanner = await startSnippetScanner();
  });

  afterAll(async () => {
    await scanner.close();
  });

  it("fires for a message written into a plain div", async () => {
    const outcome = await scanner.runJourney(pageWithMessage(`<div id="message"></div>`), ADD_AND_EXPECT);
    expect(findingSelectors(outcome, "BF-005")).toEqual(["#message"]);
    expect(outcome.result.findings[0]?.confidenceNote).toBeUndefined();
    expect(outcome.result.steps[0]?.expectationFailures).toEqual([]);
  });

  it.each([
    ["role=status", `<div id="message" role="status"></div>`],
    ["role=alert", `<div id="message" role="alert"></div>`],
    ["aria-live=polite", `<div id="message" aria-live="polite"></div>`],
    ["<output>", `<output id="message"></output>`],
  ])("does not fire for %s", async (_label, messageHtml) => {
    const outcome = await scanner.runJourney(pageWithMessage(messageHtml), ADD_AND_EXPECT);
    expect(outcome.result.findings).toEqual([]);
    expect(outcome.result.outcome).toBe("passed");
  });

  it("does not fire when focus moves to the message", async () => {
    const outcome = await scanner.runJourney(
      pageWithMessage(`<div id="message" tabindex="-1"></div>`, "message.focus();"),
      ADD_AND_EXPECT,
    );
    expect(findingSelectors(outcome, "BF-005")).toEqual([]);
  });

  it("is an expectation failure, not BF-005, when the text never appears", async () => {
    const outcome = await scanner.runJourney(`<button id="add">Add</button><div id="message"></div>`, ADD_AND_EXPECT);
    expect(findingSelectors(outcome, "BF-005")).toEqual([]);
    expect(outcome.result.steps[0]?.expectationFailures).toEqual([
      { expectation: "expect_announcement", message: 'expected message never appeared: "added to cart"' },
    ]);
  });
});
