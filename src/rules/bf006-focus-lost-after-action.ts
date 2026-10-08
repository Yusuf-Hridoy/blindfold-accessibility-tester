import type { ActionObservation } from "../types/journey-result-types.ts";
import type { RuleFinding } from "../types/scan-result-types.ts";

/**
 * BF-006: focus was on an element before a key press and on the page body after
 * it, without loading a new page. Tab and Shift+Tab are excluded: tabbing off
 * the last element onto the body is normal.
 */
export function findFocusLostAfterAction(observation: ActionObservation): RuleFinding[] {
  const { key, focusBefore, focusAfter } = observation;
  if (!key || key === "Tab" || key === "Shift+Tab") return [];
  if (observation.navigatedToNewPage || !focusBefore || focusAfter) return [];
  return [
    {
      ruleId: "BF-006",
      elementId: focusBefore.elementId,
      selector: focusBefore.selector,
      description: focusBefore.description,
      step: null,
      journeyStep: observation.journeyStep,
      message: `focus fell back to the page after ${key} on ${focusBefore.description}`,
    },
  ];
}
