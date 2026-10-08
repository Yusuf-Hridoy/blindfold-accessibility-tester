// Mouse pass: every element a mouse user can interact with on the page.

import type { Page } from "playwright";
import { readRoleAndName } from "../announcer/accessibility-snapshot-fallback.ts";
import type { InteractiveBecause, MousePassElement } from "../types/scan-result-types.ts";

const NATIVE_INTERACTIVE_SELECTOR = "a[href], area[href], button, input, select, textarea, summary";

const INTERACTIVE_ROLE_SELECTOR = ["button", "link", "checkbox", "menuitem", "tab", "switch", "option", "radio"]
  .map((role) => `[role="${role}"]`)
  .join(", ");

type MousePassElementWithoutAccessibility = Omit<MousePassElement, "role" | "accessibleName" | "mouseTarget">;

/**
 * `withAccessibleNames: false` skips the per-element ARIA snapshot (role and
 * name stay empty); journeys use that for the quick overlay check after each action.
 */
export async function collectMousePassElements(
  page: Page,
  options: { withAccessibleNames: boolean } = { withAccessibleNames: true },
): Promise<MousePassElement[]> {
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

      // A listener container whose visible children are pointer or listener
      // targets themselves (delegation): the children are the mouse targets.
      function hasOwnMouseTargetDescendant(element: Element): boolean {
        for (const descendant of element.querySelectorAll("*")) {
          if (!helpers.isVisible(descendant)) continue;
          if (window.__blindfoldHasClickListener(descendant) || setsPointerCursor(descendant)) return true;
        }
        return false;
      }

      function whyInteractive(element: Element): InteractiveBecause | null {
        if (element.matches(nativeSelector)) return "native-element";
        if (element.matches(roleSelector)) return "aria-role";
        // Clickable non-interactive elements: skip those inside a control
        // (part of it) and those containing one (event delegation containers).
        if (element.parentElement?.closest(interactiveSelector) || hasIncludedAncestor(element)) return null;
        if (element.querySelector(interactiveSelector)) return null;
        if (window.__blindfoldHasClickListener(element)) {
          return hasOwnMouseTargetDescendant(element) ? null : "click-listener";
        }
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

  if (!options.withAccessibleNames) {
    return elements.map((element) => ({ ...element, role: "", accessibleName: "", mouseTarget: "not-checked" }));
  }
  const withAccessibility: MousePassElement[] = [];
  for (const element of elements) {
    const { role, name } = await readRoleAndName(page.locator(element.selector).first());
    withAccessibility.push({ ...element, role, accessibleName: name, mouseTarget: "not-checked" });
  }
  return withAccessibility;
}

/**
 * After the keyboard walk: for each element the keyboard never reached, scroll
 * it into view (focus doesn't move) and hit-test 5 points: the centre and 4
 * points inset 25% from the corners, clamped to the viewport. If no point lands
 * on the element or a descendant, it's clipped or covered: not a mouse target.
 */
export async function checkMouseTargets(page: Page, elements: MousePassElement[], reachedElementIds: Set<number>): Promise<MousePassElement[]> {
  const idsToCheck = elements.filter((element) => !reachedElementIds.has(element.elementId)).map((element) => element.elementId);
  const hitResults = await page.evaluate((elementIds) => {
    const results: Record<number, boolean> = {};

    // Walks up the composed tree, crossing shadow roots via their host.
    function isSelfOrComposedDescendant(hit: Element, target: Element): boolean {
      for (let node: Node | null = hit; node; ) {
        if (node === target) return true;
        const parent: Node | null = node.parentNode;
        node = parent instanceof ShadowRoot ? parent.host : parent;
      }
      return false;
    }

    for (const elementId of elementIds) {
      const element = window.__blindfoldElements.elementForId(elementId);
      if (!element || !element.isConnected) {
        results[elementId] = false;
        continue;
      }
      element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      const box = element.getBoundingClientRect();
      const clampX = (x: number) => Math.min(Math.max(x, 0), window.innerWidth - 1);
      const clampY = (y: number) => Math.min(Math.max(y, 0), window.innerHeight - 1);
      const points = [
        [box.left + box.width / 2, box.top + box.height / 2],
        [box.left + box.width * 0.25, box.top + box.height * 0.25],
        [box.left + box.width * 0.75, box.top + box.height * 0.25],
        [box.left + box.width * 0.25, box.top + box.height * 0.75],
        [box.left + box.width * 0.75, box.top + box.height * 0.75],
      ];
      // Query from the element's own root so hits inside its shadow tree resolve.
      const root = element.getRootNode();
      const hitTester: DocumentOrShadowRoot = root instanceof ShadowRoot ? root : document;
      results[elementId] = points.some(([x = 0, y = 0]) => {
        const hit = hitTester.elementFromPoint(clampX(x), clampY(y));
        return hit !== null && isSelfOrComposedDescendant(hit, element);
      });
    }
    return results;
  }, idsToCheck);

  return elements.map((element) =>
    element.elementId in hitResults ? { ...element, mouseTarget: hitResults[element.elementId] ?? false } : element,
  );
}
