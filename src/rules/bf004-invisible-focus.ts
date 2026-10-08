import type { CollectedScanData, RuleFinding } from "../types/scan-result-types.ts";

/** BF-004: focus stops with no visible change on focus. Never reported on "unknown". */
export function findInvisibleFocus(data: CollectedScanData): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const reportedElementIds = new Set<number>();
  for (const stop of data.focusStops) {
    if (stop.focusVisible !== false || reportedElementIds.has(stop.elementId)) continue;
    reportedElementIds.add(stop.elementId);
    findings.push({
      ruleId: "BF-004",
      elementId: stop.elementId,
      selector: stop.selector,
      description: stop.description,
      step: stop.step,
    });
  }
  return findings;
}
