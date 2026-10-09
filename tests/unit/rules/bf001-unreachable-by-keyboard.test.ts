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

  it("fires for a mouse target before a focus trap: the walk passed its position", async () => {
    const outcome = await scanner.scan(`
      <a href="#start">Start</a>
      <div id="menu" style="cursor: pointer">Menu</div>
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
    expect(outcome.result.stoppedBecause).toBe("focus-trap");
    expect(findingSelectors(outcome, "BF-001")).toEqual(["#menu"]);
    expect(outcome.result.notTested.map((element) => [element.selector, element.reason])).toEqual([["#after", "blocked by focus trap"]]);
  });

  it("in a journey blocked by a trap, fires for a matching control before the trap, not after it", async () => {
    const trapScript = `<script>
        document.getElementById("box").addEventListener("keydown", (event) => {
          if (event.key === "Tab" && !event.shiftKey && document.activeElement.id === "join") {
            event.preventDefault();
            document.getElementById("email").focus();
          }
        });
      </script>`;
    const before = await scanner.runJourney(
      `<a href="#start">Start</a><div id="help" style="cursor: pointer">Help</div>
       <div id="box"><input id="email" aria-label="Email"><button id="join">Join</button></div>${trapScript}`,
      [{ reach: "Help, button", press: "Enter" }],
    );
    expect(before.result.findings.map((finding) => [finding.ruleId, finding.selector])).toEqual([
      ["BF-003", "#email"],
      ["BF-001", "#help"],
    ]);
    const after = await scanner.runJourney(
      `<a href="#start">Start</a>
       <div id="box"><input id="email" aria-label="Email"><button id="join">Join</button></div>
       <div id="help" style="cursor: pointer">Help</div>${trapScript}`,
      [{ reach: "Help, button", press: "Enter" }],
    );
    expect(after.result.findings.map((finding) => [finding.ruleId, finding.selector])).toEqual([["BF-003", "#email"]]);
  });

  const POLL = (name: string, idPrefix: string) => `
    <fieldset><legend>Do you like the shop? (${name})</legend>
      <label><input type="radio" name="${name}" id="${idPrefix}-1" value="1">Excellent</label>
      <label><input type="radio" name="${name}" id="${idPrefix}-2" value="2">Good</label>
      <label><input type="radio" name="${name}" id="${idPrefix}-3" value="3">Poor</label>
      <label><input type="radio" name="${name}" id="${idPrefix}-4" value="4">Very bad</label>
    </fieldset>`;

  it("does not fire for the other radios of a native radio group (arrow keys reach them)", async () => {
    const outcome = await scanner.scan(`<form>${POLL("poll", "pollanswers")}<button type="submit">Vote</button></form>`);
    expect(outcome.result.focusStops.filter((stop) => stop.role === "radio")).toHaveLength(1);
    // The three radios Tab skipped are mouse targets, so without the radio-group rule they'd be BF-001.
    const mouseTargets = outcome.result.mousePassElements.map((element) => element.selector);
    expect(mouseTargets).toEqual(expect.arrayContaining(["#pollanswers-2", "#pollanswers-3", "#pollanswers-4"]));
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
    expect(outcome.result.notTested).toEqual([]);
  });

  it("does not fire for two separate radio groups that were both reached", async () => {
    const outcome = await scanner.scan(`<form>${POLL("delivery", "delivery")}${POLL("payment", "payment")}<button type="submit">Next</button></form>`);
    expect(outcome.result.focusStops.filter((stop) => stop.role === "radio")).toHaveLength(2);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
    expect(outcome.result.notTested).toEqual([]);
  });

  it("does not fire for the other tabs of a roving-tabindex tablist; lists them as assumed reachable", async () => {
    const outcome = await scanner.scan(`
      <div role="tablist" aria-label="Product details">
        <button role="tab" id="tab-description" aria-selected="true" tabindex="0">Description</button>
        <button role="tab" id="tab-sizes" aria-selected="false" tabindex="-1">Sizes</button>
        <button role="tab" id="tab-reviews" aria-selected="false" tabindex="-1">Reviews</button>
      </div>
      <a href="#more">More</a>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
    expect(outcome.result.notTested.map((element) => [element.selector, element.reason])).toEqual([
      ["#tab-sizes", "assumed reachable with arrow keys, not verified"],
      ["#tab-reviews", "assumed reachable with arrow keys, not verified"],
    ]);
  });

  it("still fires for a mouse-only div next to a radio group", async () => {
    const outcome = await scanner.scan(`
      <form>${POLL("poll", "pollanswers")}<div id="vote" style="cursor: pointer">Vote</div></form>
      <script>document.getElementById("vote").addEventListener("click", () => {});</script>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual(["#vote"]);
    expect(outcome.result.notTested).toEqual([]);
  });

  it("in a journey, a radio that Tab skips (arrow keys reach it) is not BF-001", async () => {
    const outcome = await scanner.runJourney(`<form>${POLL("poll", "pollanswers")}<button type="submit">Vote</button></form>`, [
      { reach: "Good, radio", press: "Space" },
    ]);
    expect(outcome.result.steps[0]?.status).toBe("failed");
    expect(outcome.result.findings).toEqual([]);
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
