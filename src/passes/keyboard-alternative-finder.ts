// Mouse targets that have a keyboard alternative on purpose, so they aren't
// BF-001 barriers:
//   - parts of a keyboard-operable widget that only the mouse needs: a
//     spinbutton's +/- buttons, a combobox's open button, a slider's rail
//     (the widget itself is reached and works with arrow keys or Alt+Down);
//   - the label of a reached control (clicking it just focuses the control).

import type { Page } from "playwright";

export interface KeyboardAlternatives {
  /** Listed as "not tested": the widget is reachable, its mouse-only part isn't checked. */
  widgetPartIds: number[];
  /** Labels of reached controls: not barriers at all. */
  labelIds: number[];
}

/** Widgets operated with keys on the widget itself, whose extra buttons or tracks are mouse shortcuts. */
const VALUE_WIDGET_ROLES = ["slider", "spinbutton", "combobox"];

export async function findKeyboardAlternatives(page: Page, candidateIds: number[], reachedIds: number[]): Promise<KeyboardAlternatives> {
  if (candidateIds.length === 0 || reachedIds.length === 0) return { widgetPartIds: [], labelIds: [] };
  return page.evaluate(
    ({ candidates, reached, widgetRoles }) => {
      const helpers = window.__blindfoldElements;
      const reachedElements = reached.map((id) => helpers.elementForId(id)).filter((element): element is Element => element !== undefined);

      function roleOf(element: Element): string {
        const explicit = (element.getAttribute("role") ?? "").trim().split(/\s+/)[0];
        if (explicit) return explicit;
        if (element instanceof HTMLInputElement) {
          if (element.type === "range") return "slider";
          if (element.type === "number") return "spinbutton";
          if (element.list) return "combobox";
        }
        if (element instanceof HTMLSelectElement && !element.multiple && element.size <= 1) return "combobox";
        return "";
      }

      const valueWidgets = reachedElements.filter((element) => widgetRoles.includes(roleOf(element)));

      /**
       * Tied to the widget: taken out of the Tab order on purpose, a track or
       * handle with no text of its own, or controlling the same thing.
       */
      function isTiedTo(candidate: Element, widget: Element): boolean {
        const tabIndex = candidate.getAttribute("tabindex");
        if (tabIndex !== null && Number.parseInt(tabIndex, 10) < 0) return true;
        if ((candidate.textContent ?? "").trim() === "" && !candidate.getAttribute("aria-label")) return true;
        const controls = candidate.getAttribute("aria-controls");
        return controls !== null && (controls === widget.getAttribute("aria-controls") || controls === widget.id);
      }

      /**
       * Inside the widget, or tied to it in its immediate container when that
       * holds no other kind of reached control.
       */
      function isPartOfWidget(candidate: Element): boolean {
        return valueWidgets.some((widget) => {
          if (widget.contains(candidate)) return true;
          const container = widget.parentElement;
          if (!container || !container.contains(candidate) || !isTiedTo(candidate, widget)) return false;
          return reachedElements.every((other) => !container.contains(other) || widgetRoles.includes(roleOf(other)));
        });
      }

      function labelsAReachedControl(candidate: Element): boolean {
        if (candidate instanceof HTMLLabelElement && candidate.control && reachedElements.includes(candidate.control)) return true;
        if (!candidate.id) return false;
        return reachedElements.some((element) => (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).includes(candidate.id));
      }

      const widgetPartIds: number[] = [];
      const labelIds: number[] = [];
      for (const id of candidates) {
        const element = helpers.elementForId(id);
        if (!element) continue;
        if (labelsAReachedControl(element)) labelIds.push(id);
        else if (isPartOfWidget(element)) widgetPartIds.push(id);
      }
      return { widgetPartIds, labelIds };
    },
    { candidates: candidateIds, reached: reachedIds, widgetRoles: VALUE_WIDGET_ROLES },
  );
}
