import type { CollectedScanData, RuleFinding } from "../types/scan-result-types.ts";

/** BF-001: mouse targets that never became a focus stop. */
export function findUnreachableByKeyboard(data: CollectedScanData): RuleFinding[] {
  // If the walk was cut short, unreached elements are "not tested", not findings,
  // except those before a trap: the walk passed their position, so Tab skipped them.
  if (data.stoppedBecause === "max-tabs") return [];
  const beforeTrap = new Set(data.elementIdsBeforeTrap ?? []);
  const passedByWalk = (elementId: number) => data.stoppedBecause !== "focus-trap" || beforeTrap.has(elementId);

  const reachedElementIds = new Set(data.focusStops.map((stop) => stop.elementId));
  return data.mousePassElements
    // Clipped or covered elements can't be clicked either, so they're not barriers.
    .filter((element) => !reachedElementIds.has(element.elementId) && element.mouseTarget !== false && passedByWalk(element.elementId))
    .map(({ elementId, selector, description }) => ({
      ruleId: "BF-001",
      elementId,
      selector,
      description,
      step: null,
    }));
}
