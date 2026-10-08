import type { ActionObservation } from "../types/journey-result-types.ts";
import type { RuleFinding } from "../types/scan-result-types.ts";

export const LOWER_CONFIDENCE_NOTE = "lower confidence: checked without the screen-reader engine";

/**
 * BF-005: the expected text appeared visibly but was never announced.
 * Not fired when the text sits in a live region or <output>, or focus is on it:
 * a screen reader announces those even if our engine missed it.
 * Text that never appeared is an expectation failure, decided by the runner.
 */
export function findSilentUpdates(observation: ActionObservation): RuleFinding[] {
  const check = observation.announcement;
  if (!check || check.announced || !check.appearedIn) return [];
  if (check.appearedIn.inLiveRegion || check.appearedIn.focusOnIt) return [];
  const { elementId, selector, description } = check.appearedIn;
  return [
    {
      ruleId: "BF-005",
      elementId,
      selector,
      description,
      step: null,
      journeyStep: observation.journeyStep,
      message: `"${check.expectedText}" shown but never announced`,
      ...(check.screenReaderAvailable ? {} : { confidenceNote: LOWER_CONFIDENCE_NOTE }),
    },
  ];
}
