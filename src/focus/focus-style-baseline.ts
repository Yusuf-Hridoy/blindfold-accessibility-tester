// Focus visibility (BF-004). Before any Tab press, record the unfocused styles
// of every focusable element, its ::before and ::after, its parent and its
// grandparent. A MutationObserver records the same full baseline for focusable
// elements added later. On focus, any difference means a visible indicator.
// Elements focused before a clean baseline could be read are "unknown".

import type { Page } from "playwright";
import type { FocusVisibility } from "../types/scan-result-types.ts";

export interface FocusVisibilityCheck {
  focusVisible: FocusVisibility;
  focusStyleChanges: string[];
}

type FlatStyles = Record<string, string>;

interface FocusStyleBaselineStore {
  baselines: WeakMap<Element, FlatStyles>;
  readFullFocusStyles: (element: Element) => FlatStyles;
}

declare global {
  interface Window {
    __blindfoldFocusStyles?: FocusStyleBaselineStore;
  }
}

const FOCUS_STYLE_PROPERTIES = [
  "outline-style",
  "outline-width",
  "outline-color",
  "outline-offset",
  "box-shadow",
  "border-top-style",
  "border-top-width",
  "border-top-color",
  "border-right-style",
  "border-right-width",
  "border-right-color",
  "border-bottom-style",
  "border-bottom-width",
  "border-bottom-color",
  "border-left-style",
  "border-left-width",
  "border-left-color",
  "background-color",
  "background-image",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-color",
  "text-decoration-thickness",
];

const PSEUDO_ELEMENT_EXTRA_PROPERTIES = ["content", "opacity", "transform"];

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[tabindex]",
  '[contenteditable]:not([contenteditable="false"])',
].join(", ");

/** Records baselines for the page as it is now, then keeps watching for new elements. */
export async function recordFocusStyleBaselines(page: Page): Promise<void> {
  await page.evaluate(
    ({ properties, pseudoExtraProperties, focusableSelector }) => {
      function readStyles(element: Element, pseudoElement: string | null, propertyNames: string[]): FlatStyles {
        const computed = getComputedStyle(element, pseudoElement);
        const styles: FlatStyles = {};
        for (const property of propertyNames) styles[property] = computed.getPropertyValue(property);
        // An outline with no style or no width draws nothing, whatever its colour.
        if (styles["outline-style"] === "none" || parseFloat(styles["outline-width"] ?? "0") === 0) {
          styles["outline-style"] = "none";
          styles["outline-width"] = "0px";
          styles["outline-color"] = "none";
          styles["outline-offset"] = "0px";
        }
        return styles;
      }

      function addWithPrefix(target: FlatStyles, prefix: string, styles: FlatStyles): void {
        for (const [property, value] of Object.entries(styles)) target[`${prefix}.${property}`] = value;
      }

      function readFullFocusStyles(element: Element): FlatStyles {
        const allStyles: FlatStyles = {};
        const pseudoProperties = [...properties, ...pseudoExtraProperties];
        addWithPrefix(allStyles, "element", readStyles(element, null, properties));
        addWithPrefix(allStyles, "::before", readStyles(element, "::before", pseudoProperties));
        addWithPrefix(allStyles, "::after", readStyles(element, "::after", pseudoProperties));
        const parent = element.parentElement;
        if (parent) addWithPrefix(allStyles, "parent", readStyles(parent, null, properties));
        const grandparent = parent?.parentElement;
        if (grandparent) addWithPrefix(allStyles, "grandparent", readStyles(grandparent, null, properties));
        return allStyles;
      }

      const baselines = new WeakMap<Element, FlatStyles>();

      // A baseline read while focus is inside the area it covers (element,
      // parent, grandparent) could include focus styles. That happens at page
      // load when a script has already focused something, and for elements
      // inserted and focused in one go. Such elements wait until focus is
      // elsewhere; if focus reaches the element first, it stays "unknown".
      const waitingForCleanBaseline = new Set<Element>();

      function focusIsInsideBaselineArea(element: Element): boolean {
        const focused = document.activeElement;
        if (!focused || focused === document.body || focused === document.documentElement) return false;
        const widestArea = element.parentElement?.parentElement ?? element.parentElement ?? element;
        return widestArea.contains(focused);
      }

      function recordBaselineWhenClean(element: Element): void {
        if (baselines.has(element)) return;
        if (focusIsInsideBaselineArea(element)) {
          waitingForCleanBaseline.add(element);
          return;
        }
        waitingForCleanBaseline.delete(element);
        baselines.set(element, readFullFocusStyles(element));
      }

      for (const element of document.querySelectorAll(focusableSelector)) recordBaselineWhenClean(element);

      // New elements get the same full baseline when inserted.
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const addedNode of mutation.addedNodes) {
            if (!(addedNode instanceof Element)) continue;
            const candidates = addedNode.matches(focusableSelector) ? [addedNode] : [];
            candidates.push(...addedNode.querySelectorAll(focusableSelector));
            for (const candidate of candidates) recordBaselineWhenClean(candidate);
          }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });

      window.addEventListener(
        "focusin",
        () => {
          for (const element of waitingForCleanBaseline) {
            if (element === document.activeElement) waitingForCleanBaseline.delete(element);
            else recordBaselineWhenClean(element);
          }
        },
        { capture: true },
      );

      window.__blindfoldFocusStyles = { baselines, readFullFocusStyles };
    },
    {
      properties: FOCUS_STYLE_PROPERTIES,
      pseudoExtraProperties: PSEUDO_ELEMENT_EXTRA_PROPERTIES,
      focusableSelector: FOCUSABLE_SELECTOR,
    },
  );
}

/** Compares the focused element's current styles with its baseline. */
export async function checkFocusVisibility(page: Page): Promise<FocusVisibilityCheck> {
  return page.evaluate(() => {
    const store = window.__blindfoldFocusStyles;
    const focused = document.activeElement;
    const baseline = focused ? store?.baselines.get(focused) : undefined;
    if (!store || !focused || focused === document.body || !baseline) {
      return { focusVisible: "unknown" as const, focusStyleChanges: [] };
    }
    const current = store.readFullFocusStyles(focused);
    const allKeys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
    const focusStyleChanges = [...allKeys].filter((key) => baseline[key] !== current[key]);
    return { focusVisible: focusStyleChanges.length > 0, focusStyleChanges };
  });
}
