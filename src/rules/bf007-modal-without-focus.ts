import type { ActionObservation, ModalObservation } from "../types/journey-result-types.ts";
import type { RuleFinding } from "../types/scan-result-types.ts";

function dialogFinding(observation: ActionObservation, dialog: ModalObservation): RuleFinding {
  const label = dialog.accessibleName || dialog.description;
  return {
    ruleId: "BF-007",
    elementId: dialog.elementId,
    selector: dialog.selector,
    description: dialog.description,
    step: null,
    journeyStep: observation.journeyStep,
    message: `${label} opened, focus stayed behind it`,
  };
}

/**
 * BF-007: a dialog newly became visible and focus is not inside it, or
 * expect_focus_inside names a visible dialog that focus is outside of.
 * One finding per dialog per step.
 */
export function findModalsWithoutFocus(observation: ActionObservation): RuleFinding[] {
  const dialogs = observation.newlyVisibleModals.filter((dialog) => !dialog.focusInside);
  const expected = observation.focusOutsideExpectedDialog;
  if (expected && !dialogs.some((dialog) => dialog.elementId === expected.elementId)) dialogs.push(expected);
  return dialogs.map((dialog) => dialogFinding(observation, dialog));
}
