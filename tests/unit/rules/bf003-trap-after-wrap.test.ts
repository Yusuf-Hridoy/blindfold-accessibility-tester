// A walk that starts on an element focused at load wraps past the end of the
// page. A focus trap it then runs into must still be reported (BF-003), not
// mistaken for the end of a full cycle.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findingSelectors, startSnippetScanner, type SnippetScanner } from "../../helpers/scan-html-snippet.ts";

let scanner: SnippetScanner;

beforeAll(async () => {
  scanner = await startSnippetScanner();
});

afterAll(async () => {
  await scanner.close();
});

describe("a focus trap after the walk wraps", () => {
  it("is BF-003; the link after the trap is not tested and nothing is BF-001", async () => {
    const outcome = await scanner.scan(`
      <p><a href="#a">A</a></p>
      <div id="box"><input id="e" aria-label="Email"><button id="s">Subscribe</button></div>
      <p><a href="#b">B</a></p>
      <div><button id="accept">Accept</button></div>
      <script>
        document.getElementById("s").addEventListener("keydown", (ev) => {
          if (ev.key === "Tab" && !ev.shiftKey) { ev.preventDefault(); document.getElementById("e").focus(); }
        });
        document.getElementById("accept").focus();
      </script>`);
    const { result } = outcome;
    expect(result.focusStops[0]).toMatchObject({ step: 0, selector: "#accept" });
    expect(result.stoppedBecause).toBe("focus-trap");
    expect(findingSelectors(outcome, "BF-003")).toEqual(["#e"]);
    const trap = result.findings.find((finding) => finding.ruleId === "BF-003");
    expect(trap?.trapCycle?.map((element) => element.selector)).toEqual(["#e", "#s"]);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
    expect(result.notTested.map((element) => [element.description, element.reason])).toEqual([['a "B"', "blocked by focus trap"]]);
  });
});
