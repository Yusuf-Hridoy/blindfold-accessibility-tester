// Controls that Tab skips on purpose because arrow keys reach them: the other
// radios of a native radio group, and the items of ARIA composite widgets
// (tabs, menus, listboxes…). Neither is a BF-001 barrier when the keyboard
// reached the group. Arrow keys are not pressed to check (that can change a
// selection), so ARIA items are reported as "assumed reachable", not verified.

import type { Page } from "playwright";

export interface ArrowKeyReachability {
  /** Other radios of a native radio group whose checked/first radio was a focus stop: browsers guarantee arrow keys reach them. */
  nativeRadioGroup: number[];
  /** Items of an ARIA composite widget that had a focus stop: arrow keys should reach them, but Blindfold didn't check. */
  assumedInCompositeWidget: number[];
}

/** Roles whose items are reached with arrow keys by design (one Tab stop for the whole widget). */
export const ARROW_KEY_WIDGET_ROLES = ["radiogroup", "tablist", "menu", "menubar", "toolbar", "listbox", "grid", "tree", "treegrid"];

/** Sorts the unreached candidates into native radio-group members, ARIA widget items, and the rest (left out). */
export async function findArrowKeyReachable(page: Page, candidateIds: number[], reachedIds: number[]): Promise<ArrowKeyReachability> {
  if (candidateIds.length === 0 || reachedIds.length === 0) return { nativeRadioGroup: [], assumedInCompositeWidget: [] };
  return page.evaluate(
    ({ candidates, reached, widgetRoles }) => {
      const helpers = window.__blindfoldElements;
      const reachedElements = reached.map((id) => helpers.elementForId(id)).filter((element): element is Element => element !== undefined);
      const reachedSet = new Set(reachedElements);
      const widgetSelector = widgetRoles.map((role) => `[role="${role}"]`).join(", ");

      /** Same name, same form (or no form, in the same document or shadow root). */
      function radioGroupOf(radio: HTMLInputElement): HTMLInputElement[] {
        const root = radio.getRootNode() as Document | ShadowRoot;
        return Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter(
          (other) => other.name === radio.name && other.form === radio.form,
        );
      }

      const nativeRadioGroup: number[] = [];
      const assumedInCompositeWidget: number[] = [];
      for (const id of candidates) {
        const element = helpers.elementForId(id);
        if (!element) continue;
        if (element instanceof HTMLInputElement && element.type === "radio" && element.name !== "") {
          if (!element.disabled && helpers.isVisible(element) && radioGroupOf(element).some((radio) => reachedSet.has(radio))) {
            nativeRadioGroup.push(id);
          }
          continue;
        }
        // The widget around the item (not the element itself: an unreached widget is still a barrier).
        const widget = element.parentElement?.closest(widgetSelector);
        if (widget && reachedElements.some((reachedElement) => widget.contains(reachedElement))) assumedInCompositeWidget.push(id);
      }
      return { nativeRadioGroup, assumedInCompositeWidget };
    },
    { candidates: candidateIds, reached: reachedIds, widgetRoles: ARROW_KEY_WIDGET_ROLES },
  );
}
