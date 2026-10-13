// The web UI's History and Compare: past runs are the report.json files in
// the results folder, and comparisons reuse `blindfold compare` (written to
// <results>/comparisons/<old>-vs-<new>/).

import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AUDIO_FILE_NAME } from "../audio/audio-replay-writer.ts";
import { buildComparisonHtml, buildComparisonJson, comparisonVerdict } from "../compare/comparison-report-builder.ts";
import { compareReports, ComparisonError, loadReportFile, type ComparedFinding, type LoadedReport } from "../compare/report-comparison.ts";
import { summarizeJourneyResult, summarizeScanResult } from "../runs/scan-and-journey-runs.ts";
import { TOOL_VERSION } from "../tool-version.ts";
import type { RunKind } from "../types/progress-event-types.ts";
import { UiRequestError } from "./ui-request-error.ts";

export const COMPARISONS_FOLDER = "comparisons";

export interface HistoryEntry {
  /** The run's folder name. */
  id: string;
  kind: RunKind;
  /** The page URL or the journey name. */
  subject: string;
  scannedAt: string;
  viewport: string;
  barrierCount: number;
  verdict: string;
  reportUrl: string;
  audioUrl: string | null;
}

export interface ComparisonResponse {
  kind: RunKind;
  verdict: string;
  totals: { fixed: number; new: number; stillPresent: number };
  fixed: string[];
  new: string[];
  journeySummary: string | null;
  warnings: string[];
  comparisonUrl: string;
}

/** A run folder name: no slashes, dots-only names or other path tricks. */
export function isRunId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value) && value !== COMPARISONS_FOLDER;
}

function resultsUrl(...parts: string[]): string {
  return `/results/${parts.map(encodeURIComponent).join("/")}`;
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false,
  );
}

async function historyEntryFor(resultsFolder: string, id: string): Promise<HistoryEntry | null> {
  let report: LoadedReport;
  try {
    report = await loadReportFile(path.join(resultsFolder, id, "report.json"));
  } catch {
    return null; // not a run folder, or a damaged report
  }
  const summary = report.kind === "scan" ? summarizeScanResult(report.result) : summarizeJourneyResult(report.result);
  const hasAudio = await exists(path.join(resultsFolder, id, AUDIO_FILE_NAME));
  return {
    id,
    kind: report.kind,
    subject: summary.subject,
    scannedAt: report.result.scannedAt,
    viewport: report.result.viewport?.name ?? "desktop",
    barrierCount: summary.barrierCount,
    verdict: summary.verdict,
    reportUrl: resultsUrl(id, "report.html"),
    audioUrl: hasAudio ? resultsUrl(id, AUDIO_FILE_NAME) : null,
  };
}

/** Every run in the results folder, newest first. */
export async function readHistory(resultsFolder: string): Promise<HistoryEntry[]> {
  const folders = await readdir(resultsFolder, { withFileTypes: true }).catch(() => []);
  const entries = await Promise.all(
    folders.filter((entry) => entry.isDirectory() && isRunId(entry.name)).map((entry) => historyEntryFor(resultsFolder, entry.name)),
  );
  return entries
    .filter((entry): entry is HistoryEntry => entry !== null)
    .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt) || b.id.localeCompare(a.id));
}

async function loadRun(resultsFolder: string, id: unknown, field: string): Promise<LoadedReport> {
  if (!isRunId(id)) throw new UiRequestError(400, "Choose a run from the history.", field);
  const reportFile = path.join(resultsFolder, id, "report.json");
  if (!(await exists(reportFile))) throw new UiRequestError(400, "That run is no longer in the results folder. Reload the page.", field);
  return loadReportFile(reportFile);
}

function summaries(findings: ComparedFinding[]): string[] {
  return findings.map((finding) => `${finding.ruleId} ${finding.summary}${finding.journeyStep !== undefined ? ` (step ${finding.journeyStep})` : ""}`);
}

/** Compares two runs like `blindfold compare` and writes comparison.html and comparison.json. */
export async function compareRuns(resultsFolder: string, oldId: unknown, newId: unknown): Promise<ComparisonResponse> {
  if (oldId === newId) throw new UiRequestError(400, "Choose two different runs.", "newRunId");
  try {
    const comparison = compareReports(await loadRun(resultsFolder, oldId, "oldRunId"), await loadRun(resultsFolder, newId, "newRunId"), TOOL_VERSION);
    const comparisonId = `${String(oldId)}-vs-${String(newId)}`;
    const folder = path.join(resultsFolder, COMPARISONS_FOLDER, comparisonId);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, "comparison.json"), buildComparisonJson(comparison));
    await writeFile(path.join(folder, "comparison.html"), buildComparisonHtml(comparison));
    return {
      kind: comparison.kind,
      verdict: comparisonVerdict(comparison),
      totals: comparison.totals,
      fixed: summaries(comparison.fixed),
      new: summaries(comparison.new),
      journeySummary: comparison.journey?.summary ?? null,
      warnings: comparison.warnings,
      comparisonUrl: resultsUrl(COMPARISONS_FOLDER, comparisonId, "comparison.html"),
    };
  } catch (error) {
    if (error instanceof ComparisonError) throw new UiRequestError(400, error.message, "newRunId");
    throw error;
  }
}
