import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectMousePassElements } from "../../src/passes/mouse-pass-collector.ts";
import type { MousePassElement } from "../../src/types/scan-result-types.ts";
import { startSnippetScanner, type SnippetScanner } from "../helpers/scan-html-snippet.ts";

const SNIPPET = `
  <a id="native-link" href="#top">Link</a>
  <button id="native-button">Native</button>
  <div id="aria-button" role="button" tabindex="0">Aria button</div>
  <div id="listener-div">Click me</div>
  <div id="onclick-attribute-div" onclick="void 0">Inline handler</div>
  <span id="pointer-span" style="cursor: pointer">Pointer</span>
  <button id="icon-button" style="cursor: pointer"><svg id="icon-svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg><span id="icon-text">Save</span></button>
  <ul id="delegating-list"><li><button id="remove-button">Remove</button></li></ul>
  <div id="hidden-div" hidden>Hidden</div>
  <div id="invisible-div" style="visibility: hidden">Invisible</div>
  <div id="zero-size-div" style="width: 0; height: 0; overflow: hidden">Zero</div>
  <div inert><div id="inert-div">Inert</div></div>
  <button id="disabled-button" disabled>Disabled</button>
  <div id="aria-disabled-div" role="button" aria-disabled="true">Aria disabled</div>
  <div id="delegating-menu">
    <span id="menu-tea" style="cursor: pointer">Tea</span>
    <span id="menu-coffee" style="cursor: pointer">Coffee</span>
  </div>
  <div id="listener-with-hidden-pointer-child"><span hidden style="cursor: pointer">Hidden</span>Visible text</div>
  <script>
    document.getElementById("delegating-menu").addEventListener("click", () => {});
    document.getElementById("listener-with-hidden-pointer-child").addEventListener("click", () => {});
    for (const id of ["listener-div", "delegating-list", "hidden-div", "invisible-div", "zero-size-div", "inert-div"]) {
      document.getElementById(id).addEventListener("click", () => {});
    }
  </script>`;

describe("collectMousePassElements", () => {
  let scanner: SnippetScanner;
  let elements: MousePassElement[];
  const selectors = () => elements.map((element) => element.selector);

  beforeAll(async () => {
    scanner = await startSnippetScanner();
    elements = await collectMousePassElements(await scanner.open(SNIPPET));
  });

  afterAll(async () => {
    await scanner.close();
  });

  it("lists native and ARIA-role interactive elements", () => {
    expect(selectors()).toEqual(
      expect.arrayContaining(["#native-link", "#native-button", "#aria-button", "#icon-button", "#remove-button"]),
    );
    expect(elements.find((element) => element.selector === "#aria-button")?.interactiveBecause).toBe("aria-role");
  });

  it("lists elements with a click listener, an onclick attribute or their own pointer cursor", () => {
    const reasons = Object.fromEntries(elements.map((element) => [element.selector, element.interactiveBecause]));
    expect(reasons["#listener-div"]).toBe("click-listener");
    expect(reasons["#onclick-attribute-div"]).toBe("click-listener");
    expect(reasons["#pointer-span"]).toBe("pointer-cursor");
  });

  it("skips containers that only delegate clicks to their buttons", () => {
    expect(selectors()).not.toContain("#delegating-list");
  });

  it("counts pointer children of a delegating listener as the targets, not the container", () => {
    expect(selectors()).toEqual(expect.arrayContaining(["#menu-tea", "#menu-coffee"]));
    expect(selectors()).not.toContain("#delegating-menu");
  });

  it("keeps a listener container whose only pointer children are hidden", () => {
    expect(selectors()).toContain("#listener-with-hidden-pointer-child");
  });

  it("leaves the mouse-target hit-test for after the keyboard walk", () => {
    expect(elements.every((element) => element.mouseTarget === "not-checked")).toBe(true);
  });

  it("skips the parts of a control that inherit its pointer cursor", () => {
    expect(selectors()).not.toContain("#icon-svg");
    expect(selectors()).not.toContain("#icon-text");
    expect(selectors().some((selector) => selector.includes("circle"))).toBe(false);
  });

  it("skips hidden, invisible, zero-size, inert and disabled elements", () => {
    for (const excluded of [
      "#hidden-div",
      "#invisible-div",
      "#zero-size-div",
      "#inert-div",
      "#disabled-button",
      "#aria-disabled-div",
    ]) {
      expect(selectors()).not.toContain(excluded);
    }
  });

  it("records role, accessible name, text and bounding box", () => {
    const button = elements.find((element) => element.selector === "#native-button");
    expect(button).toMatchObject({ tag: "button", role: "button", accessibleName: "Native", text: "Native" });
    expect(button?.boundingBox.width).toBeGreaterThan(0);
  });
});
