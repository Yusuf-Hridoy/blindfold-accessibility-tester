import type {
  CollectedScanData,
  Finding,
  FocusStop,
  NotTestedElement,
  NotTestedReason,
  RuleFinding,
  TranscriptLine,
} from "../types/scan-result-types.ts";
import { findUnreachableByKeyboard } from "./bf001-unreachable-by-keyboard.ts";
import { findUnnamedControls } from "./bf002-unnamed-control.ts";
import { findFocusTraps } from "./bf003-focus-trap.ts";
import { findInvisibleFocus } from "./bf004-invisible-focus.ts";
import { findOverlaysBlockingKeyboard } from "./bf008-overlay-blocks-keyboard.ts";

export interface RuleEngineResult {
  findings: Finding[];
  notTested: NotTestedElement[];
}

const SCAN_RULES = [
  findUnreachableByKeyboard,
  findUnnamedControls,
  findFocusTraps,
  findInvisibleFocus,
  findOverlaysBlockingKeyboard,
];
const TRANSCRIPT_LINES_AROUND_STEP = 2;

function transcriptAround(focusStops: FocusStop[], step: number | null): TranscriptLine[] {
  if (step === null) return [];
  const index = focusStops.findIndex((stop) => stop.step === step);
  if (index === -1) return [];
  return focusStops
    .slice(Math.max(0, index - TRANSCRIPT_LINES_AROUND_STEP), index + TRANSCRIPT_LINES_AROUND_STEP + 1)
    .map(({ step: lineStep, description, announcement }) => ({ step: lineStep, description, announcement }));
}

/**
 * Mouse-pass elements Blindfold couldn't check: ARIA widget items assumed
 * reachable with arrow keys, and (when the walk was cut short) elements after
 * the point where it stopped.
 */
function findNotTestedElements(data: CollectedScanData): NotTestedElement[] {
  const assumed = new Set(data.reachableWithArrowKeys?.assumedInCompositeWidget ?? []);
  const nativeRadios = new Set(data.reachableWithArrowKeys?.nativeRadioGroup ?? []);
  const notTested: NotTestedElement[] = data.mousePassElements
    .filter((element) => assumed.has(element.elementId))
    .map(({ elementId, selector, description }) => ({ elementId, selector, description, reason: "assumed reachable with arrow keys, not verified" }));

  const reason: NotTestedReason | null =
    data.stoppedBecause === "focus-trap"
      ? "blocked by focus trap"
      : data.stoppedBecause === "max-tabs"
        ? "scan stopped at max tabs"
        : null;
  if (reason === null) return notTested;
  const reachedElementIds = new Set(data.focusStops.map((stop) => stop.elementId));
  // Before the trap, unreached targets are BF-001 findings instead.
  const beforeTrap = new Set(data.stoppedBecause === "focus-trap" ? (data.elementIdsBeforeTrap ?? []) : []);
  const cutShort = data.mousePassElements
    .filter(
      (element) =>
        !reachedElementIds.has(element.elementId) &&
        element.mouseTarget !== false &&
        !beforeTrap.has(element.elementId) &&
        !assumed.has(element.elementId) &&
        !nativeRadios.has(element.elementId),
    )
    .map(({ elementId, selector, description }) => ({ elementId, selector, description, reason }));
  return [...notTested, ...cutShort];
}

/**
 * Controls inside a BF-008 overlay are reported once, under BF-008, so their
 * BF-001 findings are dropped.
 */
export function dropFindingsCoveredByOverlays<T extends RuleFinding>(findings: T[]): T[] {
  const overlayControlIds = new Set(
    findings.flatMap((finding) => finding.overlayControls?.map((control) => control.elementId) ?? []),
  );
  return findings.filter((finding) => finding.ruleId !== "BF-001" || !overlayControlIds.has(finding.elementId));
}

/** Runs every scan rule; one element can fail several rules, but never the same rule twice. */
export function runRules(data: CollectedScanData): RuleEngineResult {
  const seen = new Set<string>();
  const ruleFindings: RuleFinding[] = [];
  for (const rule of SCAN_RULES) {
    for (const finding of rule(data)) {
      const key = `${finding.ruleId} ${finding.selector}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ruleFindings.push(finding);
    }
  }
  const findings = dropFindingsCoveredByOverlays(ruleFindings).map((finding) => ({
    ...finding,
    transcriptExcerpt: transcriptAround(data.focusStops, finding.step),
  }));
  const overlayControlIds = new Set(findings.flatMap((finding) => finding.overlayControls?.map((control) => control.elementId) ?? []));
  const notTested = findNotTestedElements(data).filter((element) => !overlayControlIds.has(element.elementId));
  return { findings, notTested };
}
