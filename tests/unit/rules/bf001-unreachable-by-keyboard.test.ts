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

  it("fires on the pointer spans inside a delegating div, not on the div", async () => {
    const outcome = await scanner.scan(`
      <button>Back</button>
      <div id="menu">
        <span id="tea" style="cursor: pointer">Tea</span>
        <span id="coffee" style="cursor: pointer">Coffee</span>
      </div>
      <script>document.getElementById("menu").addEventListener("click", () => {});</script>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual(["#tea", "#coffee"]);
  });

  it("does not fire for a link inside a collapsed accordion (clipped to zero height)", async () => {
    const outcome = await scanner.scan(`
      <button aria-expanded="false">Delivery details</button>
      <div style="height: 0; overflow: hidden">
        <a id="collapsed-link" href="#rates" tabindex="-1">Delivery rates</a>
      </div>
      <p>Content after the accordion.</p>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
    const link = outcome.result.mousePassElements.find((element) => element.selector === "#collapsed-link");
    expect(link?.mouseTarget).toBe(false);
  });

  it("does not fire for a clickable div fully covered by another element", async () => {
    const outcome = await scanner.scan(`
      <button>Back</button>
      <div id="covered" style="width: 200px; height: 80px; cursor: pointer">Pay</div>
      <div style="position: fixed; inset: 0; background: white"></div>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
  });

  it("still fires for a clickable div whose centre is covered but whose corners are not", async () => {
    const outcome = await scanner.scan(`
      <button>Back</button>
      <div id="partly-covered" style="position: relative; width: 200px; height: 100px; cursor: pointer">
        Pay
        <div style="position: absolute; left: 80px; top: 40px; width: 40px; height: 20px; background: red; cursor: default"></div>
      </div>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual(["#partly-covered"]);
  });

  it("in a journey, never attaches BF-001 to a control the keyboard reached earlier on the page", async () => {
    // Step 1 reaches "Home". Step 2 looks for a "Home" button, starting after the
    // link, and gives up after 2 Tab presses: the "Home" link must not be BF-001.
    const outcome = await scanner.runJourney(
      `<a id="home" href="#home">Home</a><a href="#b">B</a><a href="#c">C</a><a href="#d">D</a><a href="#e">E</a>`,
      [
        { reach: "Home, link", expectFocusOn: "Home, link" },
        { reach: "Home, button", press: "Enter" },
      ],
      { maxTabsPerStep: 2 },
    );
    expect(outcome.result.blockedAtStep).toBe(2);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
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
