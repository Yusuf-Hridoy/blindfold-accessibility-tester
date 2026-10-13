// corpus/CORPUS-REPORT.md from the latest results, the previous run and the
// owner's verdicts. Text from scanned pages is escaped like the Action's job
// summary, so a page can't break a table.

import { escapeMarkdownCell } from "../src/action/job-summary-builder.ts";
import { CONFIDENCE_LABELS } from "../src/rules/finding-confidence.ts";
import { RULE_CATALOG } from "../src/rules/rule-catalog.ts";
import type { CorpusResults, TriageVerdicts } from "./corpus-result-types.ts";
import { SOURCE_TITLES } from "./corpus-result-types.ts";
import {
  allFindings,
  changesSinceLastRun,
  confirmedVerdict,
  formatPrecision,
  precisionRows,
  sourceTotals,
  suspectedFalseAlarms,
  type PrecisionRow,
} from "./corpus-report-maths.ts";

const RULE_ORDER = Object.keys(RULE_CATALOG);
const CONFIDENCE_ORDER = ["certain", "likely", "check-by-hand", "unknown"];
const MAX_LISTED_CHANGES = 20;

function precisionTable(firstHeader: string, rows: PrecisionRow[], label: (group: string) => string): string[] {
  return [
    `| ${firstHeader} | Findings | Real | False alarm | Unsure | Proposed | Untriaged | Precision |`,
    "|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (row) =>
        `| ${label(row.group)} | ${row.findings} | ${row.real} | ${row.falseAlarm} | ${row.unsure} | ${row.proposed} | ${row.untriaged} | ${formatPrecision(row.precision)} |`,
    ),
  ];
}

export function buildCorpusReport(latest: CorpusResults, previous: CorpusResults | null, verdicts: TriageVerdicts): string {
  const findings = allFindings(latest);
  const lines = [
    "# Blindfold real-world corpus report",
    "",
    `Run: ${latest.generatedAt} · Blindfold ${latest.toolVersion} · desktop, no audio, no screenshots.`,
    "",
    "Precision = real ÷ (real + false alarm), counting only verdicts the owner confirmed",
    "(`corpus/triage-verdicts.json` entries without `\"proposed\": true`).",
    "",
    "## Totals per source",
    "",
    "| Source | Pages | Scanned | Couldn't scan | Pages with findings | Findings |",
    "|---|---|---|---|---|---|",
    ...sourceTotals(latest).map(
      (total) => `| ${SOURCE_TITLES[total.source]} | ${total.pages} | ${total.scanned} | ${total.couldNotScan} | ${total.pagesWithFindings} | ${total.findings} |`,
    ),
    "",
    "## Precision per rule",
    "",
    ...precisionTable("Rule", precisionRows(findings, verdicts, (finding) => finding.ruleId, RULE_ORDER), (ruleId) =>
      `${ruleId} ${RULE_CATALOG[ruleId as keyof typeof RULE_CATALOG]?.title ?? ""}`.trim(),
    ),
    "",
    "## Precision per confidence level",
    "",
    "The goal: `certain` close to 100%.",
    "",
    ...precisionTable(
      "Confidence",
      precisionRows(findings, verdicts, (finding) => finding.confidence ?? "unknown", CONFIDENCE_ORDER).filter(
        (row) => row.group !== "unknown" || row.findings > 0,
      ),
      (level) => CONFIDENCE_LABELS[level as keyof typeof CONFIDENCE_LABELS] ?? level,
    ),
    "",
    "## Suspected false alarms (APG examples and BAD \"after\" pages)",
    "",
  ];

  const suspected = suspectedFalseAlarms(latest);
  if (suspected.length === 0) lines.push("None.");
  else {
    lines.push("| Page | Rule | Element | Selector | Confidence | Verdict |", "|---|---|---|---|---|---|");
    for (const { page, finding } of suspected) {
      const verdict = confirmedVerdict(verdicts, finding)?.verdict ?? "untriaged";
      lines.push(
        `| ${escapeMarkdownCell(page.url)} | ${finding.ruleId} | ${escapeMarkdownCell(finding.description)} | ${escapeMarkdownCell(finding.selector)} | ${CONFIDENCE_LABELS[finding.confidence ?? "unknown"]} | ${verdict} |`,
      );
    }
  }

  lines.push("", "## Pages that couldn't be scanned", "");
  const failed = latest.pages.filter((page) => page.status === "couldn't scan");
  if (failed.length === 0) lines.push("None.");
  else {
    lines.push("| Page | Reason |", "|---|---|");
    for (const page of failed) lines.push(`| ${escapeMarkdownCell(page.url)} | ${escapeMarkdownCell(page.reason ?? "")} |`);
  }

  lines.push("", "## Changed since last run", "");
  if (!previous) lines.push("No previous run to compare with.");
  else {
    const changes = changesSinceLastRun(previous, latest);
    lines.push(`Compared with the run of ${previous.generatedAt}.`, "");
    if (changes.changed.length === 0 && changes.addedPages.length === 0 && changes.removedPages.length === 0) lines.push("No changes.");
    for (const change of changes.changed) {
      const parts = [change.statusChange, change.fixed.length > 0 ? `${change.fixed.length} gone` : null, change.new.length > 0 ? `${change.new.length} new` : null];
      lines.push(`- ${escapeMarkdownCell(change.url)}: ${parts.filter(Boolean).join(", ")}`);
      for (const finding of change.new.slice(0, MAX_LISTED_CHANGES)) lines.push(`  - new: ${finding.ruleId} ${escapeMarkdownCell(finding.description)}`);
      for (const finding of change.fixed.slice(0, MAX_LISTED_CHANGES)) lines.push(`  - gone: ${finding.ruleId} ${escapeMarkdownCell(finding.description)}`);
    }
    for (const url of changes.addedPages) lines.push(`- ${escapeMarkdownCell(url)}: new in the corpus`);
    for (const url of changes.removedPages) lines.push(`- ${escapeMarkdownCell(url)}: removed from the corpus`);
  }
  lines.push("");
  return lines.join("\n");
}
