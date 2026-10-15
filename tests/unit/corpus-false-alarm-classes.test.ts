// One offline snippet per false-alarm class found by the real-world corpus
// (corpus/TRIAGE-CLASSES.md), each next to the real barrier it must not hide.
// Every fix is a general rule about how the web works, never about a site.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanPage, type ScanOutcome } from "../../src/scan/page-scanner.ts";
import { findingSelectors, startSnippetScanner, type SnippetScanner } from "../helpers/scan-html-snippet.ts";

let scanner: SnippetScanner;

beforeAll(async () => {
  scanner = await startSnippetScanner();
});

afterAll(async () => {
  await scanner.close();
});

function ruleIds(outcome: ScanOutcome): string[] {
  return [...new Set(outcome.result.findings.map((finding) => finding.ruleId))];
}

describe("FA-1: BF-002 only when both engines find no name", () => {
  it("a <summary> is named by its text (Guidepup speaks it), so no BF-002", async () => {
    const outcome = await scanner.scan(`<details><summary>Delivery details</summary><p>Two to four days.</p></details>`);
    expect(findingSelectors(outcome, "BF-002")).toEqual([]);
  });

  it("still fires for a nameless icon button, and for a <select> whose only spoken text is its value", async () => {
    const outcome = await scanner.scan(`
      <button id="icon"><svg width="16" height="16" aria-hidden="true"></svg></button>
      <select id="country"><option>Narnia</option><option>Gondor</option></select>`);
    expect(findingSelectors(outcome, "BF-002")).toEqual(["#icon", "#country"]);
  });
});

describe("FA-2: focus inside an open shadow root", () => {
  const SHADOW_CARD = `
    <button>Before</button>
    <product-card id="card"></product-card>
    <script>
      customElements.define("product-card", class extends HTMLElement {
        constructor() {
          super();
          this.attachShadow({ mode: "open" }).innerHTML =
            '<a href="#size">Choose a size</a> <a href="#wish">Add to wish list</a>';
        }
      });
    </script>`;

  it("records the focused element inside the shadow root, not the host: no BF-002 on the host, no false trap", async () => {
    const outcome = await scanner.scan(SHADOW_CARD);
    expect(outcome.result.focusStops.map((stop) => stop.accessibleName)).toEqual(["Before", "Choose a size", "Add to wish list"]);
    expect(ruleIds(outcome)).toEqual([]);
  });

  it("gives inner elements selectors that find exactly them", async () => {
    const outcome = await scanner.scan(SHADOW_CARD);
    const page = await scanner.open(SHADOW_CARD);
    for (const stop of outcome.result.focusStops.slice(1)) {
      const locator = page.locator(stop.selector);
      expect(await locator.count(), stop.selector).toBe(1);
      expect(await locator.textContent()).toBe(stop.accessibleName);
    }
  });
});

describe("FA-12: BF-002 only for roles that need a name", () => {
  it("a focusable scroll container with role list, or a scrollable <code>, needs no name", async () => {
    const outcome = await scanner.scan(`
      <div role="list" tabindex="0" style="width: 200px; overflow-x: auto; white-space: nowrap">
        <div role="listitem" style="display: inline-block; width: 300px">Offers</div>
      </div>
      <pre><code tabindex="0" style="display: block; width: 200px; overflow-x: auto">const longLine = "a line of code wider than its box";</code></pre>`);
    expect(findingSelectors(outcome, "BF-002")).toEqual([]);
  });

  it("still fires when a focusable element is hidden from screen readers, whatever its role", async () => {
    const outcome = await scanner.scan(`<div aria-hidden="true"><a id="hidden" href="/collections">Explore</a></div>`);
    expect(findingSelectors(outcome, "BF-002")).toEqual(["#hidden"]);
  });
});

describe("FA-6: Tab lands on <body> mid-page because a link blurs itself on focus", () => {
  it("keeps walking, even past 14 in a row: the links after them are reached; only the self-blurring links are BF-001", async () => {
    const blurringLinks = Array.from({ length: 14 }, (_, index) => `<a id="nav-${index + 1}" href="#n${index + 1}" onfocus="this.blur()">Section ${index + 1}</a>`);
    const outcome = await scanner.scan(`
      <a href="#a">A</a> <a href="#b">B</a>
      <nav>${blurringLinks.join(" ")}</nav>
      <a href="#c">C</a> <a href="#d">D</a>`);
    expect(outcome.result.focusStops.map((stop) => stop.accessibleName)).toEqual(["A", "B", "C", "D"]);
    expect(findingSelectors(outcome, "BF-001")).toEqual(Array.from({ length: 14 }, (_, index) => `#nav-${index + 1}`));
    expect(outcome.result.stoppedBecause).toBe("end-of-page");
  });
});

describe("R-8: a trap that includes the page's first focus stop", () => {
  const TRAP_TAB = `if (event.key === "Tab") event.preventDefault();`;

  it("an app container focused at load that keeps Tab: one BF-003, the rest not tested (no BF-001)", async () => {
    const outcome = await scanner.scan(`
      <div id="app" tabindex="0" aria-label="Drawing app">Canvas</div>
      <button>Pen</button> <button>Eraser</button>
      <script>
        const app = document.getElementById("app");
        app.addEventListener("keydown", (event) => { ${TRAP_TAB} });
        app.focus();
      </script>`);
    expect(outcome.result.stoppedBecause).toBe("focus-trap");
    expect(findingSelectors(outcome, "BF-003")).toEqual(["#app"]);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
    expect(outcome.result.notTested.map((element) => [element.description, element.reason])).toEqual([
      ['button "Pen"', "blocked by focus trap"],
      ['button "Eraser"', "blocked by focus trap"],
    ]);
  });

  it("the first Tab stop keeps Tab (walk started at the top): one BF-003, no BF-001", async () => {
    const outcome = await scanner.scan(`
      <input id="search" aria-label="Search"> <button>Go</button>
      <script>document.getElementById("search").addEventListener("keydown", (event) => { ${TRAP_TAB} });</script>`);
    expect(findingSelectors(outcome, "BF-003")).toEqual(["#search"]);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
  });

  it("a modal dialog that keeps focus inside it is not a trap", async () => {
    const outcome = await scanner.scan(`
      <a href="#outside">Outside</a>
      <dialog id="help" aria-label="Help"><button id="one">One</button><button id="two">Two</button></dialog>
      <script>document.getElementById("help").showModal(); document.getElementById("one").focus();</script>`);
    expect(findingSelectors(outcome, "BF-003")).toEqual([]);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
  });
});

describe("FA-7: mouse-only parts of a keyboard-operable widget", () => {
  it("spinbutton +/- buttons, a combobox's open button and a slider's rail are not BF-001", async () => {
    const outcome = await scanner.scan(`
      <div class="spinner">
        <button tabindex="-1" aria-label="Remove adult">−</button>
        <input id="adults" role="spinbutton" aria-label="Adults" value="1">
        <button tabindex="-1" aria-label="Add adult">+</button>
      </div>
      <div class="combobox">
        <input role="combobox" aria-label="States" aria-expanded="false">
        <button tabindex="-1" aria-label="Show states">▾</button>
      </div>
      <div class="slider" style="position: relative; width: 300px; height: 30px">
        <div id="rail" style="position: absolute; inset: 10px 0; background: #ccc; cursor: pointer"></div>
        <div role="slider" tabindex="0" aria-label="Price" aria-valuenow="5" style="position: absolute; left: 50px; width: 20px; height: 30px; background: #333"></div>
      </div>
      <script>document.getElementById("rail").addEventListener("click", () => {});</script>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
    expect(outcome.result.notTested.map((element) => element.reason)).toEqual(
      Array(4).fill("mouse-only part of a keyboard widget; the widget is reachable"),
    );
  });

  it("still fires for a mouse-only control with its own text next to a widget (it isn't a part of the widget)", async () => {
    const outcome = await scanner.scan(`
      <div><input type="range" aria-label="Volume"><div id="reset" style="cursor: pointer">Reset</div></div>
      <script>document.getElementById("reset").addEventListener("click", () => {});</script>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual(["#reset"]);
  });

  it("still fires for a mouse-only control next to a widget when the container holds other controls", async () => {
    const outcome = await scanner.scan(`
      <form>
        <input role="combobox" aria-label="States" aria-expanded="false">
        <a href="/help">Help</a>
        <div id="pay" style="cursor: pointer">Pay</div>
      </form>
      <script>document.getElementById("pay").addEventListener("click", () => {});</script>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual(["#pay"]);
  });
});

describe("FA-8: an arrow-key widget nested in another one", () => {
  it("radios of a radiogroup inside a toolbar whose roving stop is elsewhere are reached with arrow keys", async () => {
    const outcome = await scanner.scan(`
      <div role="toolbar" aria-label="Text formatting">
        <button tabindex="0">Bold</button>
        <div role="radiogroup" aria-label="Alignment">
          <button role="radio" aria-checked="true" tabindex="-1">Left</button>
          <button role="radio" aria-checked="false" tabindex="-1">Center</button>
        </div>
      </div>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
  });
});

describe("FA-9: a clickable label of a reachable control", () => {
  it("the label element of a combobox (aria-labelledby) or a <label> is not BF-001", async () => {
    const outcome = await scanner.scan(`
      <div id="fruit-label" style="cursor: pointer">Favourite fruit</div>
      <div role="combobox" tabindex="0" aria-labelledby="fruit-label" aria-expanded="false">Apple</div>
      <label id="email-label" for="email" style="cursor: pointer">Email</label> <input id="email">
      <script>document.getElementById("fruit-label").addEventListener("click", () => {});</script>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
  });
});

describe("FA-10: a modal backdrop that closes on click", () => {
  const BACKDROP_LISTENER = `<script>document.getElementById("backdrop").addEventListener("click", () => {});</script>`;

  it("an empty full-viewport backdrop behind a dialog panel is not BF-001", async () => {
    const outcome = await scanner.scan(`
      <p>Shop content <a href="#shop">Shop</a></p>
      <div style="position: fixed; inset: 0; z-index: 10">
        <div style="display: flex; min-height: 100vh; align-items: center; justify-content: center">
          <div id="backdrop" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5)"></div>
          <div style="position: relative; background: white; padding: 20px">
            <p>Choose a country</p><select aria-label="Country"><option>Narnia</option></select><button>Continue</button>
          </div>
        </div>
      </div>
      ${BACKDROP_LISTENER}`);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
  });

  it("still fires for a full-viewport clickable banner with a picture and nothing drawn over it", async () => {
    const outcome = await scanner.scan(`
      <button>Menu</button>
      <div id="hero" style="position: absolute; inset: 0; background: url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E') rgb(200, 30, 30); cursor: pointer"></div>
      <script>document.getElementById("hero").addEventListener("click", () => {});</script>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual(["#hero"]);
  });

  it("nor an overlay of its own (BF-008)", async () => {
    const outcome = await scanner.scan(`
      <div id="backdrop" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5)"></div>
      <div role="dialog" aria-modal="true" aria-label="Choose a country" style="position: fixed; top: 100px; left: 100px; background: white; padding: 20px">
        <button>Close</button>
      </div>
      ${BACKDROP_LISTENER}`);
    expect(ruleIds(outcome)).toEqual([]);
  });
});

describe("FA-11: a listener-only element without a pointer cursor or role", () => {
  it("is still BF-001 but only 'check by hand'; with a pointer cursor it stays 'certain'", async () => {
    const outcome = await scanner.scan(`
      <button>Start</button>
      <img id="flag" alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'/%3E" width="16" height="16">
      <div id="pay" style="cursor: pointer">Pay now</div>
      <script>
        document.getElementById("flag").addEventListener("click", () => {});
        document.getElementById("pay").addEventListener("click", () => {});
      </script>`);
    const levels = Object.fromEntries(outcome.result.findings.filter((finding) => finding.ruleId === "BF-001").map((finding) => [finding.selector, finding.confidence]));
    expect(levels).toEqual({ "#flag": "check-by-hand", "#pay": "certain" });
  });
});

describe("FA-13 and U-4: what counts as a blocking overlay (BF-008)", () => {
  it("a full-viewport app canvas is the page's surface, not an overlay control", async () => {
    const outcome = await scanner.scan(`
      <div style="position: fixed; inset: 0">
        <canvas id="board" style="width: 100%; height: 100%; display: block"></canvas>
      </div>
      <button style="position: relative; z-index: 1">Menu</button>
      <script>document.getElementById("board").addEventListener("click", () => {});</script>`);
    expect(findingSelectors(outcome, "BF-008")).toEqual([]);
  });

  it("a closed drawer (invisible, clicks pass through) is never an overlay", async () => {
    const outcome = await scanner.scan(`
      <a href="#shop">Shop</a>
      <div id="drawer" style="position: fixed; inset: 0; opacity: 0; pointer-events: none">
        <button tabindex="-1">Checkout</button>
      </div>`);
    expect(ruleIds(outcome)).toEqual([]);
  });

  it("still fires for a visible cookie banner whose buttons the keyboard can't reach", async () => {
    const outcome = await scanner.scan(`
      <a href="#shop">Shop</a>
      <div id="banner" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6)">
        <div style="background: white; margin: 100px; padding: 20px">
          <p>We use cookies.</p><div class="choice" style="cursor: pointer">Accept</div><div class="choice" style="cursor: pointer">Reject</div>
        </div>
      </div>
      <script>for (const choice of document.querySelectorAll(".choice")) choice.addEventListener("click", () => {});</script>`);
    expect(findingSelectors(outcome, "BF-008")).toEqual(["#banner"]);
  });
});

describe("FA-3, FA-4, FA-5: BF-004 needs both the style check and the pixels to show no change", () => {
  it("FA-3: a focus colour applied through a CSS transition is visible", async () => {
    const outcome = await scanner.scan(`
      <style>
        a { color: rgb(0, 60, 200); transition: color 0.2s 0.2s, background-color 0.2s 0.2s; outline: none; }
        a:focus { color: rgb(200, 0, 60); background-color: rgb(255, 240, 150); }
      </style>
      <a id="faded" href="#a">Plans and pricing</a>`);
    expect(findingSelectors(outcome, "BF-004")).toEqual([]);
  });

  it("FA-4: an indicator drawn on a child element is visible", async () => {
    const outcome = await scanner.scan(`
      <style>
        button { outline: none; border: 0; background: white; padding: 4px; }
        button:focus .card-frame { outline: 3px solid rgb(80, 80, 250); }
      </style>
      <button id="card"><span class="card-frame">Accept payments</span></button>`);
    expect(findingSelectors(outcome, "BF-004")).toEqual([]);
  });

  it("FA-5: an indicator on an ancestor three levels up (focus-within), drawn within 8 px of the element, is visible", async () => {
    const outcome = await scanner.scan(`
      <style>
        a { outline: none; }
        .card { position: relative; padding: 4px; }
        .card h2 { margin: 0; }
        .card:focus-within::after { content: ""; position: absolute; inset: 0; outline: 3px solid rgb(1, 110, 211); }
      </style>
      <div class="card"><h2><span><a id="story" href="#story">After the ban, police use another model</a></span></h2></div>`);
    expect(findingSelectors(outcome, "BF-004")).toEqual([]);
  });

  it("still fires when nothing changes at all: an outline removed from a link, and from a text field (caret hidden)", async () => {
    const outcome = await scanner.scan(`
      <style>a, input { outline: none; }</style>
      <a id="plain" href="#a">Demos</a>
      <input id="email" aria-label="Email">
      <button>After</button>`);
    expect(findingSelectors(outcome, "BF-004")).toEqual(["#plain", "#email"]);
  });
});

describe("the BF-004 pixel check in journeys and live progress", () => {
  const OUTLINE_REMOVED = `<style>a { outline: none; }</style><a href="#target">Target</a> <a href="#other">Other</a>`;

  it("a journey that ends with focus still on an element with invisible focus still reports BF-004", async () => {
    const outcome = await scanner.runJourney(OUTLINE_REMOVED, [{ reach: "Target, link" }]);
    expect(outcome.result.findings.map((finding) => `${finding.ruleId} step ${finding.journeyStep}`)).toEqual(["BF-004 step 1"]);
    expect(outcome.result.steps[0]?.status).toBe("passed-with-barriers");
    expect(outcome.result.effort.keyboardPresses).toBe(1);
  });

  it("a BF-004 decided during the next step belongs to the step where the element was reached", async () => {
    const outcome = await scanner.runJourney(OUTLINE_REMOVED, [{ reach: "Target, link" }, { reach: "Other, link" }]);
    expect(outcome.result.findings.filter((finding) => finding.ruleId === "BF-004").map((finding) => `${finding.selector} step ${finding.journeyStep}`)).toEqual([
      "body > a:nth-of-type(1) step 1",
      "body > a:nth-of-type(2) step 2",
    ]);
    expect(outcome.result.steps.map((step) => step.status)).toEqual(["passed-with-barriers", "passed-with-barriers"]);
  });

  it("live focus-stop events carry the final focus visibility (after the pixel check)", async () => {
    const events: { focusVisible: unknown }[] = [];
    const url = scanner.pageUrl(`<style>button { outline: none; } button:focus span { outline: 3px solid blue; }</style><button><span>Card</span></button> <a href="#after">After</a>`);
    const { result } = await scanPage({ url, maxTabs: 20, pageTimeoutSeconds: 10, screenshots: false, onProgress: (event) => { if (event.type === "focus-stop") events.push(event); } });
    expect(events.map((event) => event.focusVisible)).toEqual(result.focusStops.map((stop) => stop.focusVisible));
    expect(events[0]?.focusVisible).toBe(true);
  });
});

describe("inside open shadow roots (web components)", () => {
  const COMPONENT = (inner: string) => `
    <button>Start</button>
    <x-card></x-card>
    <script>
      customElements.define("x-card", class extends HTMLElement {
        constructor() {
          super();
          const root = this.attachShadow({ mode: "open" });
          root.innerHTML = ${JSON.stringify(inner)};
          root.getElementById("buy")?.addEventListener("click", () => {});
        }
      });
    </script>`;

  it("a mouse-only control inside a shadow root is BF-001", async () => {
    const outcome = await scanner.scan(COMPONENT(`<a href="#info">Info</a> <div id="buy" style="cursor: pointer">Buy now</div>`));
    expect(findingSelectors(outcome, "BF-001")).toEqual(["body > x-card #buy"]);
  });

  it("focus visibility is checked inside a shadow root: removed outline is BF-004, a visible one isn't", async () => {
    const outcome = await scanner.scan(COMPONENT(`<style>.plain { outline: none; }</style><a class="plain" href="#a">Plain</a> <a href="#b">Default</a>`));
    expect(findingSelectors(outcome, "BF-004")).toEqual(["body > x-card a:nth-of-type(1)"]);
  });
});

describe("recall gaps found on the BAD before pages", () => {
  it("a link that throws focus away (onfocus blur) is BF-001 even when another link goes to the same page", async () => {
    const outcome = await scanner.scan(`
      <a href="/news.html">News</a>
      <a id="teaser" href="/news.html" onfocus="this.blur()">Heat wave linked to temperatures</a>
      <a href="#end">End</a>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual(["#teaser"]);
  });

  it("radios of a reached group that Tab skips still need a name (BF-002, likely)", async () => {
    const outcome = await scanner.scan(`
      <fieldset><legend>Text alignment</legend>
        <input type="radio" name="align" id="left"> <input type="radio" name="align" id="right">
      </fieldset>
      <fieldset><legend>Size</legend>
        <label><input type="radio" name="size" id="small"> Small</label> <label><input type="radio" name="size" id="large"> Large</label>
      </fieldset>`);
    expect(findingSelectors(outcome, "BF-002")).toEqual(["#left", "#right"]);
    expect(outcome.result.findings.find((finding) => finding.selector === "#right")?.confidence).toBe("likely");
  });
});

describe("regressions found by the corpus re-run", () => {
  it("a custom element whose real button is inside its shadow root isn't BF-001 itself", async () => {
    const outcome = await scanner.scan(`
      <x-button id="login" style="cursor: pointer">Log in</x-button>
      <script>
        customElements.define("x-button", class extends HTMLElement {
          constructor() { super(); this.attachShadow({ mode: "open" }).innerHTML = "<button><slot></slot></button>"; }
        });
        document.getElementById("login").addEventListener("click", () => {});
      </script>`);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
  });

  it("a dropdown animating open next to a link is waited for, so a link with no focus style is still BF-004", async () => {
    const outcome = await scanner.scan(`
      <style>
        a { outline: none; }
        .menu { position: relative; display: inline-block; }
        .drop { position: absolute; top: 100%; left: 0; opacity: 0; transition: opacity 0.4s; }
        .menu:focus-within .drop { opacity: 1; }
      </style>
      <div class="menu"><a id="demos" href="#demos">Demos</a><div class="drop"><a id="item" href="#item">Grid demo</a></div></div>
      <p><button>After</button></p>`);
    expect(findingSelectors(outcome, "BF-004")).toContain("#demos");
  });
});
