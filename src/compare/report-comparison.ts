// Compares two report.json files of the same kind (scan or journey): which
// findings were fixed, which are new, which are still present, and for
// journeys how the outcome and effort changed.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { RULE_CATALOG, summarizeFinding } from "../rules/rule-catalog.ts";
import type { JourneyResult } from "../types/journey-result-types.ts";
import type { Bf002Reason, Finding, RuleId, ScanResult } from "../types/scan-result-types.ts";

/** The reports can't be compared (missing, not a Blindfold report, different kinds). Exit code 2. */
export class ComparisonError extends Error {}

export type LoadedReport =
  | { kind: "scan"; file: string; result: ScanResult }
  | { kind: "journey"; file: string; result: JourneyResult };

export interface ComparedFinding {
  ruleId: RuleId;
  reason?: Bf002Reason;
  selector: string;
  description: string;
  /** Empty when the report doesn't record it (journey reports). */
  accessibleName: string;
  wcag: string;
  /** One line, e.g. `Control has no accessible name: button.search-toggle`. */
  summary: string;
  journeyStep?: number;
}

export interface StillPresentFinding {
  old: ComparedFinding;
  new: ComparedFinding;
  /** "selector": same rule, reason and selector. "description": the selector changed; matched by description and name. */
  matchedBy: "selector" | "description";
}

export interface JourneyOutcomeChange {
  oldOutcome: JourneyResult["outcome"];
  newOutcome: JourneyResult["outcome"];
  /** e.g. "was blocked at step 2, now passes" */
  summary: string;
  oldEffortRatio: number | null;
  newEffortRatio: number | null;
}

export interface ReportIdentity {
  file: string;
  /** The page URL (scan) or journey name. */
  subject: string;
  toolVersion: string;
  scannedAt: string;
}

export interface ReportComparison {
  toolVersion: string;
  comparedAt: string;
  kind: LoadedReport["kind"];
  oldReport: ReportIdentity;
  newReport: ReportIdentity;
  warnings: string[];
  totals: { fixed: number; new: number; stillPresent: number };
  fixed: ComparedFinding[];
  new: ComparedFinding[];
  stillPresent: StillPresentFinding[];
  journey: JourneyOutcomeChange | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Scan reports have a url and focus stops; journey reports have a journey name and steps. */
export function identifyReport(content: unknown, file: string): LoadedReport {
  const name = path.basename(file);
  if (!isRecord(content) || !Array.isArray(content.findings)) {
    throw new ComparisonError(`${name} isn't a Blindfold report.json (it has no "findings" list).`);
  }
  if (typeof content.journeyName === "string" && Array.isArray(content.steps)) {
    return { kind: "journey", file, result: content as unknown as JourneyResult };
  }
  if (typeof content.url === "string" && Array.isArray(content.focusStops)) {
    return { kind: "scan", file, result: content as unknown as ScanResult };
  }
  throw new ComparisonError(`${name} isn't a Blindfold scan or journey report.`);
}

export async function loadReportFile(file: string): Promise<LoadedReport> {
  const absolutePath = path.resolve(file);
  let text: string;
  try {
    text = await readFile(absolutePath, "utf8");
  } catch {
    throw new ComparisonError(`Report not found: ${absolutePath}. Pass the report.json files written by "blindfold scan" or "blindfold run".`);
  }
  let content: unknown;
  try {
    content = JSON.parse(text);
  } catch {
    throw new ComparisonError(`${path.basename(file)} isn't valid JSON: ${absolutePath}`);
  }
  return identifyReport(content, absolutePath);
}

/** Accessible names by element id, from what a scan report records about each element. */
function accessibleNamesById(report: LoadedReport): Map<number, string> {
  const names = new Map<number, string>();
  if (report.kind !== "scan") return names;
  for (const element of report.result.mousePassElements ?? []) names.set(element.elementId, element.accessibleName);
  for (const stop of report.result.focusStops) names.set(stop.elementId, stop.accessibleName);
  return names;
}

function toComparedFindings(report: LoadedReport): ComparedFinding[] {
  const names = accessibleNamesById(report);
  return report.result.findings.map((finding: Finding) => ({
    ruleId: finding.ruleId,
    ...(finding.reason ? { reason: finding.reason } : {}),
    selector: finding.selector,
    description: finding.description,
    accessibleName: names.get(finding.elementId) ?? "",
    wcag: RULE_CATALOG[finding.ruleId]?.wcag ?? "",
    summary: summarizeFinding(finding),
    ...(finding.journeyStep !== undefined ? { journeyStep: finding.journeyStep } : {}),
  }));
}

// The reason is part of both keys: a BF-002 that changes from "missing name"
// to "hidden from screen readers" needs a different fix, so it's fixed + new.
export function selectorKey(finding: ComparedFinding): string {
  return [finding.ruleId, finding.reason ?? "", finding.selector].join("\u0000");
}

export function descriptionKey(finding: ComparedFinding): string {
  return [finding.ruleId, finding.reason ?? "", finding.description, finding.accessibleName].join("\u0000");
}

/** One-to-one matching: first by selector, then (for what's left) by description and accessible name. */
export function matchFindings(
  oldFindings: ComparedFinding[],
  newFindings: ComparedFinding[],
): { fixed: ComparedFinding[]; new: ComparedFinding[]; stillPresent: StillPresentFinding[] } {
  const unmatchedOld = [...oldFindings];
  const stillPresent: StillPresentFinding[] = [];
  let unmatchedNew = [...newFindings];
  for (const [matchedBy, keyOf] of [
    ["selector", selectorKey],
    ["description", descriptionKey],
  ] as const) {
    const leftOver: ComparedFinding[] = [];
    for (const finding of unmatchedNew) {
      const index = unmatchedOld.findIndex((candidate) => keyOf(candidate) === keyOf(finding));
      if (index === -1) {
        leftOver.push(finding);
        continue;
      }
      const [oldFinding] = unmatchedOld.splice(index, 1);
      if (oldFinding) stillPresent.push({ old: oldFinding, new: finding, matchedBy });
    }
    unmatchedNew = leftOver;
  }
  return { fixed: unmatchedOld, new: unmatchedNew, stillPresent };
}

function pastOutcome(result: JourneyResult): string {
  if (result.outcome === "blocked") return `was blocked at step ${result.blockedAtStep}`;
  if (result.outcome === "completed-with-barriers") return `completed with ${result.barrierCount} ${result.barrierCount === 1 ? "barrier" : "barriers"}`;
  return "passed";
}

function currentOutcome(result: JourneyResult): string {
  if (result.outcome === "blocked") return `is blocked at step ${result.blockedAtStep}`;
  if (result.outcome === "completed-with-barriers") return `completes with ${result.barrierCount} ${result.barrierCount === 1 ? "barrier" : "barriers"}`;
  return "passes";
}

export function describeJourneyChange(oldResult: JourneyResult, newResult: JourneyResult): JourneyOutcomeChange {
  const unchanged = pastOutcome(oldResult) === pastOutcome(newResult);
  const now = currentOutcome(newResult).replace(/^is /, "");
  return {
    oldOutcome: oldResult.outcome,
    newOutcome: newResult.outcome,
    summary: unchanged ? `still ${now}` : `${pastOutcome(oldResult)}, now ${now}`,
    oldEffortRatio: oldResult.effort?.ratio ?? null,
    newEffortRatio: newResult.effort?.ratio ?? null,
  };
}

function identityOf(report: LoadedReport): ReportIdentity {
  return {
    file: report.file,
    subject: report.kind === "scan" ? report.result.url : report.result.journeyName,
    toolVersion: report.result.toolVersion,
    scannedAt: report.result.scannedAt,
  };
}

function viewportName(report: LoadedReport): string {
  return report.result.viewport?.name ?? "desktop";
}

export function compareReports(oldReport: LoadedReport, newReport: LoadedReport, toolVersion: string, comparedAt = new Date()): ReportComparison {
  if (oldReport.kind !== newReport.kind) {
    throw new ComparisonError(
      `Can't compare a ${oldReport.kind} report with a ${newReport.kind} report. Pass two scan reports or two journey reports.`,
    );
  }
  const old = identityOf(oldReport);
  const current = identityOf(newReport);
  const warnings: string[] = [];
  if (old.subject !== current.subject) {
    const what = oldReport.kind === "scan" ? "pages" : "journeys";
    warnings.push(`The reports are for different ${what}: "${old.subject}" and "${current.subject}". Comparing anyway.`);
  }
  if (viewportName(oldReport) !== viewportName(newReport)) {
    warnings.push(`The reports used different viewports: ${viewportName(oldReport)} and ${viewportName(newReport)}. Comparing anyway.`);
  }
  const matched = matchFindings(toComparedFindings(oldReport), toComparedFindings(newReport));
  return {
    toolVersion,
    comparedAt: comparedAt.toISOString(),
    kind: oldReport.kind,
    oldReport: old,
    newReport: current,
    warnings,
    totals: { fixed: matched.fixed.length, new: matched.new.length, stillPresent: matched.stillPresent.length },
    ...matched,
    journey: oldReport.kind === "journey" && newReport.kind === "journey" ? describeJourneyChange(oldReport.result, newReport.result) : null,
  };
}
