// Safety net for the keyboard walk itself: when more than half of what a mouse
// can click was never reached, the walk may have gone wrong (e.g. a page that
// moves focus in a way Blindfold didn't follow). The findings are kept; the
// report just says to check them by hand.

import type { Finding, MousePassElement } from "../types/scan-result-types.ts";

export const INCOMPLETE_WALK_WARNING =
  "More than half of the clickable elements were never reached. The keyboard walk may have been incomplete; check these results by hand.";

export function incompleteWalkWarnings(mousePassElements: MousePassElement[], findings: Pick<Finding, "ruleId">[]): string[] {
  const clickable = mousePassElements.filter((element) => element.mouseTarget !== false).length;
  const unreached = findings.filter((finding) => finding.ruleId === "BF-001").length;
  return clickable > 0 && unreached / clickable > 0.5 ? [INCOMPLETE_WALK_WARNING] : [];
}
