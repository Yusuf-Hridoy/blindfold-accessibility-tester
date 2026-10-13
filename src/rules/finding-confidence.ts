// How sure Blindfold is that a finding is a real barrier:
//   certain        the evidence leaves no doubt
//   likely         probably a barrier, but a legitimate pattern could look the same
//   check-by-hand  the author did something on purpose (e.g. tabindex="-1"), or the
//                  engines disagree; a person should decide
// A pure function of the finding and the data collected for its page.

import type { FindingConfidence, FocusStop, MousePassElement, RuleFinding } from "../types/scan-result-types.ts";
import { FOCUSED_ON_LOAD_PREFIX } from "../passes/keyboard-pass-walker.ts";

export interface ConfidenceEvidence {
  mousePassElements?: MousePassElement[];
  focusStops?: FocusStop[];
}

/** Tags that are interactive by themselves; anything else made clickable by script is "non-interactive". */
const INTERACTIVE_TAGS = new Set(["a", "area", "button", "input", "select", "textarea", "summary", "details", "label", "option", "audio", "video"]);

/** Roles whose missing name is certainly a barrier: users act on them by name. */
const CONTROL_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "treeitem",
]);

/** Parts of a Guidepup announcement that describe state, not the name. */
const STATE_PHRASES = [
  /^(not )?(checked|pressed|expanded|selected)$/,
  /^(collapsed|mixed|disabled|required|invalid|read ?only|busy|modal|multi-?selectable|current( page)?)$/,
  /^has popup( \w+)?$/,
  /^(position|set size|level) \d+$/,
  /^orientated \w+$/,
];

export const CONFIDENCE_LABELS: Record<FindingConfidence | "unknown", string> = {
  certain: "certain",
  likely: "likely",
  "check-by-hand": "check by hand",
  unknown: "unknown",
};

export const CONFIDENCE_LEGEND: Record<FindingConfidence, string> = {
  certain: "the evidence leaves no doubt.",
  likely: "probably a barrier, but a legitimate pattern can look the same.",
  "check-by-hand": "the page did something on purpose (e.g. tabindex=\"-1\") or the engines disagree; a person should decide.",
};

function bf001Confidence(element: MousePassElement | undefined): FindingConfidence {
  if (!element) return "likely";
  const tabIndex = element.tabIndexAttribute === null ? null : Number.parseInt(element.tabIndexAttribute, 10);
  if ((tabIndex !== null && tabIndex < 0) || element.insideArrowKeyWidget) return "check-by-hand";
  if (element.tag === "a" && element.interactiveBecause !== "native-element") return "likely";
  if (element.roleAttribute !== null && element.tabIndexAttribute === null) return "likely";
  const plainScriptedElement =
    element.interactiveBecause === "click-listener" &&
    !INTERACTIVE_TAGS.has(element.tag) &&
    element.tabIndexAttribute === null &&
    element.roleAttribute === null;
  return plainScriptedElement ? "certain" : "likely";
}

/** True when Guidepup said something besides the role and states, i.e. it found a name (or description). */
export function screenReaderSpokeAName(stop: FocusStop): boolean {
  const announcement = stop.announcement.startsWith(FOCUSED_ON_LOAD_PREFIX)
    ? stop.announcement.slice(FOCUSED_ON_LOAD_PREFIX.length).trim()
    : stop.announcement;
  const [, ...rest] = announcement.split(", ");
  return rest.some((part) => part.trim() !== "" && !STATE_PHRASES.some((phrase) => phrase.test(part.trim().toLowerCase())));
}

function bf002Confidence(finding: RuleFinding, stop: FocusStop | undefined): FindingConfidence {
  if (finding.reason === "hidden-from-screen-readers") return "certain";
  if (!stop) return "likely";
  if (screenReaderSpokeAName(stop)) return "check-by-hand";
  return CONTROL_ROLES.has(stop.role) ? "certain" : "likely";
}

function bf004Confidence(stop: FocusStop | undefined): FindingConfidence {
  if (!stop) return "likely";
  return stop.outlineRemovedOnFocus === true && (stop.weakFocusStyleChanges ?? []).length === 0 ? "certain" : "likely";
}

export function findingConfidence(finding: RuleFinding, evidence: ConfidenceEvidence = {}): FindingConfidence {
  const stop = evidence.focusStops?.find((candidate) => candidate.elementId === finding.elementId);
  switch (finding.ruleId) {
    case "BF-001":
      return bf001Confidence(evidence.mousePassElements?.find((element) => element.elementId === finding.elementId));
    case "BF-002":
      return bf002Confidence(finding, stop);
    case "BF-003":
      return "certain";
    case "BF-004":
      return bf004Confidence(stop);
    case "BF-005":
      return finding.confidenceNote ? "check-by-hand" : "certain";
    case "BF-006":
    case "BF-007":
    case "BF-008":
      return "likely";
  }
}

/** Counts per level, for summaries. Findings from older reports have no level ("unknown"). */
export function countByConfidence(findings: { confidence?: FindingConfidence }[]): Record<FindingConfidence | "unknown", number> {
  const counts = { certain: 0, likely: 0, "check-by-hand": 0, unknown: 0 };
  for (const finding of findings) counts[finding.confidence ?? "unknown"]++;
  return counts;
}

/** e.g. "2 certain, 1 likely" (levels with no findings left out). */
export function describeConfidenceCounts(findings: { confidence?: FindingConfidence }[]): string {
  const counts = countByConfidence(findings);
  return (Object.keys(counts) as (FindingConfidence | "unknown")[])
    .filter((level) => counts[level] > 0)
    .map((level) => `${counts[level]} ${CONFIDENCE_LABELS[level]}`)
    .join(", ");
}
