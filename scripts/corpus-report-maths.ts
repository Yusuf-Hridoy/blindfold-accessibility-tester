// The numbers in CORPUS-REPORT.md: totals per source, precision per rule and
// per confidence level, suspected false alarms, and changes since the last run.
// Pure functions, tested offline (tests/unit/build-corpus-report.test.ts).

import { matchFindings, type ComparedFinding } from "../src/compare/report-comparison.ts";
import { RULE_CATALOG } from "../src/rules/rule-catalog.ts";
import type { CorpusFinding, CorpusPageResult, CorpusResults, CorpusSource, TriageEntry, TriageVerdicts } from "./corpus-result-types.ts";
import { CORPUS_SOURCES } from "./corpus-result-types.ts";

export function triageKey(finding: Pick<CorpusFinding, "url" | "ruleId" | "selector">): string {
  return `${finding.url} ${finding.ruleId} ${finding.selector}`;
}

/** The owner's verdict, or null when there's none yet (no entry, or only a proposal). */
export function confirmedVerdict(verdicts: TriageVerdicts, finding: CorpusFinding): TriageEntry | null {
  const entry = verdicts[triageKey(finding)];
  return entry && !entry.proposed ? entry : null;
}

export interface PrecisionRow {
  group: string;
  findings: number;
  real: number;
  falseAlarm: number;
  unsure: number;
  /** Claude proposed a verdict the owner hasn't confirmed. */
  proposed: number;
  /** No verdict at all. */
  untriaged: number;
  /** real ÷ (real + false alarm), confirmed verdicts only; null when there are none. */
  precision: number | null;
}

export function precisionRows(findings: CorpusFinding[], verdicts: TriageVerdicts, groupOf: (finding: CorpusFinding) => string, groupOrder: string[]): PrecisionRow[] {
  const rows = new Map<string, PrecisionRow>();
  for (const group of groupOrder) rows.set(group, { group, findings: 0, real: 0, falseAlarm: 0, unsure: 0, proposed: 0, untriaged: 0, precision: null });
  for (const finding of findings) {
    const group = groupOf(finding);
    const row = rows.get(group) ?? { group, findings: 0, real: 0, falseAlarm: 0, unsure: 0, proposed: 0, untriaged: 0, precision: null };
    rows.set(group, row);
    row.findings++;
    const entry = verdicts[triageKey(finding)];
    if (!entry) row.untriaged++;
    else if (entry.proposed) row.proposed++;
    else if (entry.verdict === "real") row.real++;
    else if (entry.verdict === "false-alarm") row.falseAlarm++;
    else row.unsure++;
  }
  for (const row of rows.values()) {
    const judged = row.real + row.falseAlarm;
    row.precision = judged === 0 ? null : row.real / judged;
  }
  return [...rows.values()].filter((row) => row.findings > 0 || groupOrder.includes(row.group));
}

export function allFindings(results: CorpusResults): CorpusFinding[] {
  return results.pages.flatMap((page) => page.findings);
}

export interface SourceTotals {
  source: CorpusSource;
  pages: number;
  scanned: number;
  couldNotScan: number;
  pagesWithFindings: number;
  findings: number;
}

export function sourceTotals(results: CorpusResults): SourceTotals[] {
  return CORPUS_SOURCES.map((source) => {
    const pages = results.pages.filter((page) => page.source === source);
    const scanned = pages.filter((page) => page.status === "scanned");
    return {
      source,
      pages: pages.length,
      scanned: scanned.length,
      couldNotScan: pages.length - scanned.length,
      pagesWithFindings: scanned.filter((page) => page.findings.length > 0).length,
      findings: scanned.reduce((sum, page) => sum + page.findings.length, 0),
    };
  });
}

/** Findings on pages that should have none: APG examples and BAD "after" pages. */
export function suspectedFalseAlarms(results: CorpusResults): { page: CorpusPageResult; finding: CorpusFinding }[] {
  return results.pages
    .filter((page) => page.source === "apg" || page.source === "bad-after")
    .flatMap((page) => page.findings.map((finding) => ({ page, finding })));
}

function asComparedFinding(finding: CorpusFinding): ComparedFinding {
  return {
    ruleId: finding.ruleId,
    ...(finding.reason ? { reason: finding.reason } : {}),
    selector: finding.selector,
    description: finding.description,
    accessibleName: "",
    wcag: RULE_CATALOG[finding.ruleId]?.wcag ?? "",
    summary: `${RULE_CATALOG[finding.ruleId]?.title ?? finding.ruleId}: ${finding.description}`,
  };
}

export interface PageChange {
  url: string;
  /** e.g. "couldn't scan → scanned"; null when the status didn't change. */
  statusChange: string | null;
  fixed: ComparedFinding[];
  new: ComparedFinding[];
}

/** Per page in both runs: findings gone and new (matched like `blindfold compare`), and status changes. */
export function changesSinceLastRun(previous: CorpusResults, latest: CorpusResults): { changed: PageChange[]; addedPages: string[]; removedPages: string[] } {
  const previousByUrl = new Map(previous.pages.map((page) => [page.url, page]));
  const latestUrls = new Set(latest.pages.map((page) => page.url));
  const changed: PageChange[] = [];
  const addedPages: string[] = [];
  for (const page of latest.pages) {
    const before = previousByUrl.get(page.url);
    if (!before) {
      addedPages.push(page.url);
      continue;
    }
    const statusChange = before.status === page.status ? null : `${before.status} → ${page.status}`;
    const bothScanned = before.status === "scanned" && page.status === "scanned";
    const match = bothScanned
      ? matchFindings(before.findings.map(asComparedFinding), page.findings.map(asComparedFinding))
      : { fixed: [], new: [], stillPresent: [] };
    if (statusChange || match.fixed.length > 0 || match.new.length > 0) {
      changed.push({ url: page.url, statusChange, fixed: match.fixed, new: match.new });
    }
  }
  const removedPages = previous.pages.map((page) => page.url).filter((url) => !latestUrls.has(url));
  return { changed, addedPages, removedPages };
}

export function formatPrecision(precision: number | null): string {
  return precision === null ? "—" : `${Math.round(precision * 100)}%`;
}
