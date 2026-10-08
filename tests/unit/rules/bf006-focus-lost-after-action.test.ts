import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findingSelectors, startSnippetScanner, type SnippetScanner } from "../../helpers/scan-html-snippet.ts";

/** Two "Remove" buttons; `afterRemove` runs after the pressed one is removed. */
function listWithRemoveButtons(afterRemove: string, extraHtml = ""): string {
  return `
    ${extraHtml}
    <ul id="list">
      <li><button class="remove" id="remove-one">Remove one</button></li>
      <li><button class="remove" id="remove-two">Remove two</button></li>
    </ul>
    <script>
      document.getElementById("list").addEventListener("click", (event) => {
        const button = event.target.closest(".remove");
        if (!button) return;
        button.closest("li").remove();
        ${afterRemove}
      });
    </script>`;
}

const REMOVE_FIRST = [{ reach: "Remove one, button", press: "Enter" as const }];

describe("BF-006 focus lost after action", () => {
  let scanner: SnippetScanner;

  beforeAll(async () => {
    scanner = await startSnippetScanner();
  });

  afterAll(async () => {
    await scanner.close();
  });

  it("fires when the focused button is removed and focus isn't moved", async () => {
    const outcome = await scanner.runJourney(listWithRemoveButtons(""), REMOVE_FIRST);
    expect(findingSelectors(outcome, "BF-006")).toEqual(["#remove-one"]);
  });

  it("does not fire when focus moves to the next button", async () => {
    const outcome = await scanner.runJourney(listWithRemoveButtons(`document.getElementById("remove-two").focus();`), REMOVE_FIRST);
    expect(outcome.result.findings).toEqual([]);
  });

  it("does not fire when focus moves to a heading with tabindex=-1", async () => {
    const outcome = await scanner.runJourney(
      listWithRemoveButtons(`document.getElementById("cart-heading").focus();`, `<h1 id="cart-heading" tabindex="-1">Cart</h1>`),
      REMOVE_FIRST,
    );
    expect(outcome.result.findings).toEqual([]);
  });

  it("does not fire when the action loads a new page", async () => {
    const nextPage = scanner.pageUrl("<h1>Next page</h1>");
    const outcome = await scanner.runJourney(`<a href="${nextPage}">Continue</a>`, [{ reach: "Continue, link", press: "Enter" }]);
    expect(outcome.result.findings).toEqual([]);
    expect(outcome.result.steps[0]?.navigatedTo).toBe(nextPage);
  });
});
