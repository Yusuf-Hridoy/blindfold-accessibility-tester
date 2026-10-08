import type {
  CollectedScanData,
  Finding,
  FocusStop,
  NotTestedElement,
  RuleFinding,
  TranscriptLine,
} from "../types/scan-result-types.ts";
import { findUnreachableByKeyboard } from "./bf001-unreachable-by-keyboard.ts";
import { findUnnamedControls } from "./bf002-unnamed-control.ts";
import { findFocusTraps } from "./bf003-focus-trap.ts";
import { findInvisibleFocus } from "./bf004-invisible-focus.ts";

export interface RuleEngineResult {
  findings: Finding[];
  notTested: NotTestedElement[];
}

const RULES = [findUnreachableByKeyboard, findUnnamedControls, findFocusTraps, findInvisibleFocus];
const TRANSCRIPT_LINES_AROUND_STEP = 2;

function transcriptAround(focusStops: FocusStop[], step: number | null): TranscriptLine[] {
  if (step === null) return [];
  const index = focusStops.findIndex((stop) => stop.step === step);
  if (index === -1) return [];
  return focusStops
    .slice(Math.max(0, index - TRANSCRIPT_LINES_AROUND_STEP), index + TRANSCRIPT_LINES_AROUND_STEP + 1)
    .map(({ step: lineStep, description, announcement }) => ({ step: lineStep, description, announcement }));
}

/** Mouse-pass elements the keyboard never reached because the walk was cut short. */
function findNotTestedElements(data: CollectedScanData): NotTestedElement[] {
  const reason =
    data.stoppedBecause === "focus-trap"
      ? "blocked by focus trap"
      : data.stoppedBecause === "max-tabs"
        ? "scan stopped at max tabs"
        : null;
  if (reason === null) return [];
  const reachedElementIds = new Set(data.focusStops.map((stop) => stop.elementId));
  return data.mousePassElements
    .filter((element) => !reachedElementIds.has(element.elementId) && element.mouseTarget !== false)
    .map(({ elementId, selector, description }) => ({ elementId, selector, description, reason }));
}

/** Runs every rule; one element can fail several rules, but never the same rule twice. */
export function runRules(data: CollectedScanData): RuleEngineResult {
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const rule of RULES) {
    for (const finding of rule(data) as RuleFinding[]) {
      const key = `${finding.ruleId} ${finding.selector}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ ...finding, transcriptExcerpt: transcriptAround(data.focusStops, finding.step) });
    }
  }
  return { findings, notTested: findNotTestedElements(data) };
}
