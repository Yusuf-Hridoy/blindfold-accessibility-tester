import type { CollectedScanData, RuleFinding } from "../types/scan-result-types.ts";

/** BF-003: one finding per confirmed trap, anchored on the first element of the cycle. */
export function findFocusTraps(data: CollectedScanData): RuleFinding[] {
  const firstInCycle = data.trap?.cycle[0];
  if (!data.trap || !firstInCycle) return [];
  return [
    {
      ruleId: "BF-003",
      elementId: firstInCycle.elementId,
      selector: firstInCycle.selector,
      description: data.trap.cycle.map((element) => element.description).join(" → "),
      step: data.trap.startStep,
      trapCycle: data.trap.cycle,
    },
  ];
}
