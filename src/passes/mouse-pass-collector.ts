// Mouse pass: every element a mouse user can interact with on the page.

import type { Page } from "playwright";
import { readRoleAndName } from "../announcer/accessibility-snapshot-fallback.ts";
import type { InteractiveBecause, MousePassElement } from "../types/scan-result-types.ts";

const NATIVE_INTERACTIVE_SELECTOR = "a[href], area[href], button, input, select, textarea, summary";

const INTERACTIVE_ROLE_SELECTOR = ["button", "link", "checkbox", "menuitem", "tab", "switch", "option", "radio"]
  .map((role) => `[role="${role}"]`)
  .join(", ");

type MousePassElementWithoutAccessibility = Omit<MousePassElement, "role" | "accessibleName">;

export async function collectMousePassElements(page: Page): Promise<MousePassElement[]> {
  const elements = await page.evaluate(
    ({ nativeSelector, roleSelector }) => {
      const helpers = window.__blindfoldElements;
      const interactiveSelector = `${nativeSelector}, ${roleSelector}`;
      const included = new Set<Element>();
      const collected: MousePassElementWithoutAccessibility[] = [];

      function hasIncludedAncestor(element: Element): boolean {
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          if (included.has(ancestor)) return true;
        }
        return false;
      }

      // `cursor` is inherited, so only count an element that sets it itself.
      function setsPointerCursor(element: Element): boolean {
        if (getComputedStyle(element).cursor !== "pointer") return false;
        const parent = element.parentElement;
        return !parent || getComputedStyle(parent).cursor !== "pointer";
      }

      function whyInteractive(element: Element): InteractiveBecause | null {
        if (element.matches(nativeSelector)) return "native-element";
        if (element.matches(roleSelector)) return "aria-role";
        // Clickable non-interactive elements: skip those inside a control
        // (part of it) and those containing one (event delegation containers).
        if (element.parentElement?.closest(interactiveSelector) || hasIncludedAncestor(element)) return null;
        if (element.querySelector(interactiveSelector)) return null;
        if (window.__blindfoldHasClickListener(element)) return "click-listener";
        if (setsPointerCursor(element)) return "pointer-cursor";
        return null;
      }

      function isDisabled(element: Element): boolean {
        return element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
      }

      for (const element of document.querySelectorAll("body *")) {
        const interactiveBecause = whyInteractive(element);
        if (!interactiveBecause || !helpers.isVisible(element) || isDisabled(element)) continue;
        included.add(element);
        const box = element.getBoundingClientRect();
        collected.push({
          ...helpers.identify(element),
          tag: element.localName,
          text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
          boundingBox: { x: box.x + window.scrollX, y: box.y + window.scrollY, width: box.width, height: box.height },
          interactiveBecause,
        });
      }
      return collected;
    },
    { nativeSelector: NATIVE_INTERACTIVE_SELECTOR, roleSelector: INTERACTIVE_ROLE_SELECTOR },
  );

  const withAccessibility: MousePassElement[] = [];
  for (const element of elements) {
    const { role, name } = await readRoleAndName(page.locator(element.selector).first());
    withAccessibility.push({ ...element, role, accessibleName: name });
  }
  return withAccessibility;
}
