import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findingSelectors, startSnippetScanner, type SnippetScanner } from "../../helpers/scan-html-snippet.ts";

describe("BF-001 unreachable by keyboard", () => {
  let scanner: SnippetScanner;

  beforeAll(async () => {
    scanner = await startSnippetScanner();
  });

  afterAll(async () => {
    await scanner.close();
  });

  it("fires for a clickable div with a listener", async () => {
    const outcome = await scanner.scan(`
      <button>Back</button>
      <div id="pay" style="cursor: pointer">Pay now</div>
      <script>document.getElementById("pay").addEventListener("click", () => {});</script>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual(["#pay"]);
  });

  it("does not fire for a list that delegates clicks to its buttons", async () => {
    const outcome = await scanner.scan(`
      <ul id="cart"><li><button>Remove one</button></li><li><button>Remove two</button></li></ul>
      <script>document.getElementById("cart").addEventListener("click", () => {});</script>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
  });

  it("does not fire for a hidden clickable div or a disabled button", async () => {
    const outcome = await scanner.scan(`
      <button>Visible</button>
      <div id="hidden-pay" hidden>Pay</div>
      <button disabled>Disabled</button>
      <script>document.getElementById("hidden-pay").addEventListener("click", () => {});</script>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
  });

  it("marks elements behind a focus trap as not tested instead of firing", async () => {
    const outcome = await scanner.scan(`
      <a href="#start">Start</a>
      <div id="box"><input id="email" aria-label="Email"><button id="join">Join</button></div>
      <div id="after" style="cursor: pointer">After the trap</div>
      <script>
        document.getElementById("box").addEventListener("keydown", (event) => {
          if (event.key === "Tab" && !event.shiftKey && document.activeElement.id === "join") {
            event.preventDefault();
            document.getElementById("email").focus();
          }
        });
      </script>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
    expect(outcome.result.notTested).toEqual([
      expect.objectContaining({ selector: "#after", reason: "blocked by focus trap" }),
    ]);
  });

  it("marks elements not reached before max-tabs as not tested instead of firing", async () => {
    const outcome = await scanner.scan(
      `<button>One</button><button>Two</button><button>Three</button><button id="four">Four</button>`,
      { maxTabs: 2 },
    );
    expect(outcome.result.stoppedBecause).toBe("max-tabs");
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
    expect(outcome.result.notTested.map((element) => element.reason)).toEqual([
      "scan stopped at max tabs",
      "scan stopped at max tabs",
    ]);
  });
});
