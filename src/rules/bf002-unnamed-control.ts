import type { Bf002Reason, CollectedScanData, FocusStop, RuleFinding } from "../types/scan-result-types.ts";

function reasonFor(stop: FocusStop): Bf002Reason | null {
  // "unknown" means the snapshot couldn't be read, which says nothing about the name.
  if (stop.role === "unknown") return null;
  // Hidden wins: adding a label wouldn't help while the screen reader can't see the control.
  if (stop.hiddenFromScreenReaders) return "hidden-from-screen-readers";
  if (stop.accessibleName.trim() === "") return "missing-name";
  return null;
}

/** BF-002: focus stops a screen reader can't name, because the name is empty or the control is hidden. */
export function findUnnamedControls(data: CollectedScanData): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const reportedElementIds = new Set<number>();
  for (const stop of data.focusStops) {
    const reason = reasonFor(stop);
    if (reason === null || reportedElementIds.has(stop.elementId)) continue;
    reportedElementIds.add(stop.elementId);
    findings.push({
      ruleId: "BF-002",
      reason,
      elementId: stop.elementId,
      selector: stop.selector,
      description: stop.description,
      step: stop.step,
    });
  }
  return findings;
}
