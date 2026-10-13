// Confidence levels: the pure decision per rule, and real snippets to prove
// the evidence (tabindex, role, outline, what Guidepup said) is collected.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { countByConfidence, describeConfidenceCounts, findingConfidence, screenReaderSpokeAName } from "../../src/rules/finding-confidence.ts";
import type { FocusStop, MousePassElement, RuleFinding } from "../../src/types/scan-result-types.ts";
import { startSnippetScanner, type SnippetScanner } from "../helpers/scan-html-snippet.ts";

function mouseElement(fields: Partial<MousePassElement>): MousePassElement {
  return {
    elementId: 1,
    selector: "#x",
    description: "div#x",
    tag: "div",
    role: "generic",
    accessibleName: "",
    text: "Pay",
    boundingBox: { x: 0, y: 0, width: 10, height: 10 },
    interactiveBecause: "click-listener",
    tabIndexAttribute: null,
    roleAttribute: null,
    insideArrowKeyWidget: false,
    mouseTarget: true,
    ...fields,
  };
}

function focusStop(fields: Partial<FocusStop>): FocusStop {
  return {
    elementId: 1,
    selector: "#x",
    description: "button#x",
    step: 1,
    announcement: "button",
    role: "button",
    accessibleName: "",
    hiddenFromScreenReaders: false,
    focusVisible: true,
    focusStyleChanges: [],
    ...fields,
  };
}

function ruleFinding(ruleId: RuleFinding["ruleId"], fields: Partial<RuleFinding> = {}): RuleFinding {
  return { ruleId, elementId: 1, selector: "#x", description: "x", step: 1, ...fields };
}

describe("findingConfidence (pure)", () => {
  it("BF-001: certain for a plain element with a click listener, likely for <a> without href, custom roles and pointer-only, check-by-hand for tabindex=-1 and arrow-key widgets", () => {
    const bf001 = ruleFinding("BF-001", { step: null });
    const level = (element: Partial<MousePassElement>) => findingConfidence(bf001, { mousePassElements: [mouseElement(element)] });
    expect(level({})).toBe("certain");
    expect(level({ tag: "span" })).toBe("certain");
    expect(level({ tag: "a" })).toBe("likely");
    expect(level({ roleAttribute: "button", interactiveBecause: "aria-role" })).toBe("likely");
    expect(level({ interactiveBecause: "pointer-cursor" })).toBe("likely");
    expect(level({ tag: "a", interactiveBecause: "native-element", tabIndexAttribute: "-1" })).toBe("check-by-hand");
    expect(level({ insideArrowKeyWidget: true })).toBe("check-by-hand");
    expect(findingConfidence(bf001)).toBe("likely");
  });

  it("BF-002: certain on control roles and hidden controls, likely on other roles, check-by-hand when Guidepup spoke a name", () => {
    const bf002 = ruleFinding("BF-002", { reason: "missing-name" });
    const level = (stop: Partial<FocusStop>, finding = bf002) => findingConfidence(finding, { focusStops: [focusStop(stop)] });
    expect(level({ role: "button", announcement: "button" })).toBe("certain");
    expect(level({ role: "link", announcement: "link" })).toBe("certain");
    expect(level({ role: "textbox", announcement: "textbox, required" })).toBe("certain");
    expect(level({ role: "region", announcement: "region" })).toBe("likely");
    expect(level({ role: "button", announcement: "button, Search" })).toBe("check-by-hand");
    expect(level({ role: "generic" }, ruleFinding("BF-002", { reason: "hidden-from-screen-readers" }))).toBe("certain");
  });

  it("ignores roles, states and the page-load prefix when deciding whether Guidepup spoke a name", () => {
    expect(screenReaderSpokeAName(focusStop({ announcement: "checkbox, not checked, required" }))).toBe(false);
    expect(screenReaderSpokeAName(focusStop({ announcement: "radio, checked, position 1, set size 2" }))).toBe(false);
    expect(screenReaderSpokeAName(focusStop({ announcement: "(focused when the page loaded) button, has popup menu, expanded" }))).toBe(false);
    expect(screenReaderSpokeAName(focusStop({ announcement: "(focused when the page loaded) button, Menu" }))).toBe(true);
  });

  it("BF-004: certain when the outline is removed and nothing else changes, likely otherwise", () => {
    const bf004 = ruleFinding("BF-004");
    const level = (stop: Partial<FocusStop>) => findingConfidence(bf004, { focusStops: [focusStop({ focusVisible: false, ...stop })] });
    expect(level({ outlineRemovedOnFocus: true, weakFocusStyleChanges: [] })).toBe("certain");
    expect(level({ outlineRemovedOnFocus: true, weakFocusStyleChanges: ["color"] })).toBe("likely");
    expect(level({ outlineRemovedOnFocus: false, weakFocusStyleChanges: [] })).toBe("likely");
  });

  it("BF-003 certain, BF-005 by engine, BF-006/007/008 likely", () => {
    expect(findingConfidence(ruleFinding("BF-003"))).toBe("certain");
    expect(findingConfidence(ruleFinding("BF-005"))).toBe("certain");
    expect(findingConfidence(ruleFinding("BF-005", { confidenceNote: "lower confidence" }))).toBe("check-by-hand");
    for (const ruleId of ["BF-006", "BF-007", "BF-008"] as const) expect(findingConfidence(ruleFinding(ruleId))).toBe("likely");
  });

  it("counts levels, with findings from older reports as unknown", () => {
    const findings = [{ confidence: "certain" as const }, { confidence: "certain" as const }, { confidence: "likely" as const }, {}];
    expect(countByConfidence(findings)).toEqual({ certain: 2, likely: 1, "check-by-hand": 0, unknown: 1 });
    expect(describeConfidenceCounts(findings)).toBe("2 certain, 1 likely, 1 unknown");
  });
});

describe("confidence on real scans", () => {
  let scanner: SnippetScanner;

  beforeAll(async () => {
    scanner = await startSnippetScanner();
  });

  afterAll(async () => {
    await scanner.close();
  });

  function levels(outcome: Awaited<ReturnType<SnippetScanner["scan"]>>, ruleId: string): Record<string, string | undefined> {
    return Object.fromEntries(outcome.result.findings.filter((finding) => finding.ruleId === ruleId).map((finding) => [finding.selector, finding.confidence]));
  }

  it("BF-001 levels come from the element's tag, listener, tabindex and role", async () => {
    const outcome = await scanner.scan(`
      <button>Start</button>
      <div id="pay">Pay now</div>
      <div id="custom" role="button">Custom</div>
      <a id="removed" href="/elsewhere" tabindex="-1">Elsewhere</a>
      <script>
        document.getElementById("pay").addEventListener("click", () => {});
        document.getElementById("custom").addEventListener("click", () => {});
      </script>`);
    expect(levels(outcome, "BF-001")).toEqual({ "#pay": "certain", "#custom": "likely", "#removed": "check-by-hand" });
  });

  it("BF-004 is certain for outline:none with no other change, likely when only the font weight changes on focus", async () => {
    // (A colour change on an underlined link already counts as visible: the underline changes colour too.)
    const outcome = await scanner.scan(`
      <style>a:focus { outline: none; } #tinted:focus { font-weight: 700; }</style>
      <a id="plain" href="#a">Plain</a>
      <a id="tinted" href="#b">Tinted</a>`);
    expect(levels(outcome, "BF-004")).toEqual({ "#plain": "certain", "#tinted": "likely" });
  });

  it("BF-002 is certain for a nameless button", async () => {
    const outcome = await scanner.scan(`<button id="icon"><svg width="16" height="16" aria-hidden="true"></svg></button>`);
    expect(levels(outcome, "BF-002")).toEqual({ "#icon": "certain" });
  });
});
