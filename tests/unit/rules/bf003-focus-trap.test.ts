import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findingSelectors, startSnippetScanner, type SnippetScanner } from "../../helpers/scan-html-snippet.ts";

describe("BF-003 focus trap", () => {
  let scanner: SnippetScanner;

  beforeAll(async () => {
    scanner = await startSnippetScanner();
  });

  afterAll(async () => {
    await scanner.close();
  });

  it("fires for a two-element trap", async () => {
    const outcome = await scanner.scan(`
      <a href="#start">Start</a>
      <div id="box"><input id="email" aria-label="Email"><button id="join">Join</button></div>
      <a href="#end">End</a>
      <script>
        document.getElementById("box").addEventListener("keydown", (event) => {
          if (event.key === "Tab" && !event.shiftKey && document.activeElement.id === "join") {
            event.preventDefault();
            document.getElementById("email").focus();
          }
        });
      </script>`);
    expect(outcome.result.stoppedBecause).toBe("focus-trap");
    expect(findingSelectors(outcome, "BF-003")).toEqual(["#email"]);
    const finding = outcome.result.findings.find((candidate) => candidate.ruleId === "BF-003");
    expect(finding?.trapCycle?.map((element) => element.selector)).toEqual(["#email", "#join"]);
    expect(finding?.step).toBe(2);
  });

  it("does not fire when focus simply wraps back to the first stop", async () => {
    const outcome = await scanner.scan(`<a href="#one">One</a><button>Two</button><button>Three</button>`);
    expect(["end-of-page", "cycle-complete"]).toContain(outcome.result.stoppedBecause);
    expect(findingSelectors(outcome, "BF-003")).toEqual([]);
  });
});
