import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { locatorForSelector } from "../../src/frames/frame-focus-follower.ts";
import { findingSelectors, startSnippetScanner, type SnippetScanner } from "../helpers/scan-html-snippet.ts";

let scanner: SnippetScanner;

beforeAll(async () => {
  scanner = await startSnippetScanner();
});

afterAll(async () => {
  await scanner.close();
});

const UNNAMED_ICON_BUTTON = `<button class="vote"><svg aria-hidden="true" width="10" height="10"></svg></button>`;

describe("same-origin iframes are tested like the page", () => {
  const page = () => {
    const reviews = scanner.pageUrl(`<button id="helpful">Helpful</button>${UNNAMED_ICON_BUTTON}`);
    return `<button id="before">Before</button><iframe id="reviews" title="Reviews" src="${reviews}"></iframe><button id="after">After</button>`;
  };

  it("Tab walks into the frame and out again", async () => {
    const { result } = await scanner.scan(page());
    expect(result.stoppedBecause).toBe("end-of-page");
    expect(result.focusStops.map((stop) => stop.selector)).toEqual([
      "#before",
      "#reviews >>> #helpful",
      "#reviews >>> body > button:nth-of-type(2)",
      "#after",
    ]);
    expect(result.focusStops[1]?.accessibleName).toBe("Helpful");
  });

  it("an unnamed button inside the frame is BF-002, with the frame path in its selector", async () => {
    const outcome = await scanner.scan(page());
    expect(findingSelectors(outcome, "BF-002")).toEqual(["#reviews >>> body > button:nth-of-type(2)"]);
    expect(outcome.result.findings).toHaveLength(1);
    expect(outcome.result.findings[0]?.elementId).toBeGreaterThanOrEqual(1_000_000);
  });

  it("frame-path selectors resolve to the element inside the frame", async () => {
    const opened = await scanner.open(page());
    await opened.waitForLoadState("load");
    expect(await locatorForSelector(opened, "#reviews >>> #helpful").textContent()).toBe("Helpful");
  });

  it("a journey can reach a target inside the frame", async () => {
    const { result } = await scanner.runJourney(page(), [{ reach: "Helpful, button", press: "Enter" }]);
    expect(result.outcome).toBe("passed");
    expect(result.effort.keyboardPresses).toBe(3);
  });
});

describe("third-party iframes are a boundary", () => {
  const page = () => {
    const payment = scanner.otherOriginPageUrl(`<button>Pay</button>${UNNAMED_ICON_BUTTON}`);
    return `<button id="before">Before</button><iframe id="payment" title="Payment" src="${payment}"></iframe><button id="after">After</button>`;
  };

  it("records focus entering the frame, reports nothing inside it, and keeps walking", async () => {
    const { result } = await scanner.scan(page());
    expect(result.findings).toEqual([]);
    expect(result.stoppedBecause).toBe("end-of-page");
    expect(result.focusStops.map((stop) => stop.selector)).toEqual(["#before", "#payment", "#after"]);
    const boundary = result.focusStops[1];
    expect(boundary?.announcement).toMatch(/^Focus entered a frame from 127\.0\.0\.1:\d+; Blindfold doesn't test third-party content\.$/);
    expect(boundary?.frameBoundary?.tabPressesInside).toBe(2);
    // Before (1), two presses inside the frame (2, 3), After (4), off the page (5).
    expect(result.focusStops.map((stop) => stop.step)).toEqual([1, 2, 4]);
    expect(result.tabPresses).toBe(5);
  });

  it("a journey's transcript notes focus entering and leaving the frame", async () => {
    const { result } = await scanner.runJourney(page(), [{ reach: "After, button", press: "Enter" }]);
    expect(result.outcome).toBe("passed");
    const lines = result.transcript.filter((entry) => entry.kind !== "page").map((entry) => [entry.kind, entry.spoken ?? entry.text]);
    expect(lines).toEqual([
      ["focus", "button, Before"],
      ["focus", expect.stringMatching(/^Focus entered a frame from 127\.0\.0\.1:\d+;/)],
      ["key", expect.stringMatching(/^\(still inside the frame from 127\.0\.0\.1:\d+\)$/)],
      ["note", expect.stringMatching(/^Focus left the frame from 127\.0\.0\.1:\d+ after 2 Tab presses inside it\.$/)],
      ["focus", "button, After"],
      ["key", "Enter"],
    ]);
  });
});

describe("trap detection through a frame", () => {
  it("finds a cycle that passes through a same-origin frame; BF-001 before it, not tested after it", async () => {
    const box = scanner.pageUrl(`<button id="inside">Inside</button>
      <script>
        document.getElementById("inside").addEventListener("keydown", (event) => {
          if (event.key === "Tab" && !event.shiftKey) {
            event.preventDefault();
            parent.document.getElementById("outside").focus();
          }
        });
      </script>`);
    const outcome = await scanner.scan(`<a href="#start">Start</a>
      <div id="early" style="cursor: pointer">Early</div>
      <button id="outside">Outside</button><iframe id="box" title="Box" src="${box}"></iframe>
      <div id="late" style="cursor: pointer">Late</div>`);
    expect(outcome.result.stoppedBecause).toBe("focus-trap");
    expect(outcome.result.trap?.cycle.map((element) => element.selector)).toEqual(["#outside", "#box >>> #inside"]);
    expect(findingSelectors(outcome, "BF-003")).toEqual(["#outside"]);
    expect(findingSelectors(outcome, "BF-001")).toEqual(["#early"]);
    expect(outcome.result.notTested.map((element) => [element.selector, element.reason])).toEqual([["#late", "blocked by focus trap"]]);
  });
});
