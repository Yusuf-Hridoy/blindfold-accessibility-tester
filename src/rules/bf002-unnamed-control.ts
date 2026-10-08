import type { CollectedScanData, RuleFinding } from "../types/scan-result-types.ts";

/** BF-002: focus stops whose accessible name (Engine B) is empty. */
export function findUnnamedControls(data: CollectedScanData): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const reportedElementIds = new Set<number>();
  for (const stop of data.focusStops) {
    // "unknown" means the snapshot couldn't be read, which says nothing about the name.
    if (stop.role === "unknown" || stop.accessibleName.trim() !== "") continue;
    if (reportedElementIds.has(stop.elementId)) continue;
    reportedElementIds.add(stop.elementId);
    findings.push({
      ruleId: "BF-002",
      elementId: stop.elementId,
      selector: stop.selector,
      description: stop.description,
      step: stop.step,
    });
  }
  return findings;
}
