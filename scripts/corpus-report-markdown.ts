// corpus/CORPUS-REPORT.md from the latest results, the previous run and the
// owner's verdicts. Text from scanned pages is escaped like the Action's job
// summary, so a page can't break a table.

import { escapeMarkdownCell } from "../src/action/job-summary-builder.ts";
import { CONFIDENCE_LABELS } from "../src/rules/finding-confidence.ts";
import { RULE_CATALOG } from "../src/rules/rule-catalog.ts";
import type { ExpectedBarrierFile } from "./build-bad-expected-barriers.ts";
import type { CorpusResults, TriageVerdicts } from "./corpus-result-types.ts";
import { SOURCE_TITLES } from "./corpus-result-types.ts";
import {
  allFindings,
  changesSinceLastRun,
  confirmedVerdict,
  formatPrecision,
  precisionRows,
  recallRows,
  sourceTotals,
  suspectedFalseAlarms,
  verdictUpkeep,
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

/** "Run: <time>", or the range when pages come from different (partial) runs. */
function describeRunTimes(results: CorpusResults): string {
  const times = results.pages.map((page) => page.scannedAt ?? results.generatedAt).sort();
  const first = times[0] ?? results.generatedAt;
  const last = times.at(-1) ?? results.generatedAt;
  return first.slice(0, 16) === last.slice(0, 16) ? `Run: ${last}` : `Pages scanned between ${first} and ${last}`;
}

function recallSection(latest: CorpusResults, expected: ExpectedBarrierFile | null): string[] {
  const lines = ["", "## Recall on the BAD \"before\" pages", ""];
  if (!expected) return [...lines, "No expected barriers yet. Run `npm run corpus:expected-bad`."];
  const rows = recallRows(latest, expected);
  const expectedTotal = rows.reduce((sum, row) => sum + row.expected, 0);
  const foundTotal = rows.reduce((sum, row) => sum + row.found, 0);
  lines.push(
    "Barriers the W3C planted that Blindfold's rules cover (WCAG failures F55 script removes focus, F65 image link",
    "without alt, F68 unlabelled field; `corpus/bad-expected-barriers.json`), and how many were found.",
    "",
    "| Rule (failure) | Expected | Found | Recall |",
    "|---|---|---|---|",
    ...rows.map((row) => `| ${row.group} | ${row.expected} | ${row.found} | ${formatPrecision(row.expected === 0 ? null : row.found / row.expected)} |`),
    `| **All** | ${expectedTotal} | ${foundTotal} | ${formatPrecision(expectedTotal === 0 ? null : foundTotal / expectedTotal)} |`,
  );
  const missed = rows.flatMap((row) => row.missed.map((item) => ({ group: row.group, ...item })));
  if (missed.length > 0) {
    lines.push("", "Missed:", "");
    for (const item of missed) lines.push(`- ${escapeMarkdownCell(item.url)}: ${item.group} \`${escapeMarkdownCell(item.barrier.description)}\``);
  }
  return lines;
}

export function buildCorpusReport(
  latest: CorpusResults,
  previous: CorpusResults | null,
  verdicts: TriageVerdicts,
  expected: ExpectedBarrierFile | null = null,
): string {
  const findings = allFindings(latest);
  const lines = [
    "# Blindfold real-world corpus report",
    "",
    `${describeRunTimes(latest)} · Blindfold ${latest.toolVersion} · desktop, no audio, no screenshots.`,
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
    ...recallSection(latest, expected),
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

  const upkeep = verdictUpkeep(latest, verdicts);
  lines.push(
    "",
    "## Verdict upkeep",
    "",
    `- ${upkeep.carried.length} findings took an earlier verdict by description (their selector changed).`,
    `- ${upkeep.stale.length} verdicts match no finding on the pages scanned in this run (fixed, or the content is gone).`,
  );
  if (upkeep.carried.length > 0 || upkeep.stale.length > 0) {
    lines.push("", "`npm run corpus:report -- --tidy-verdicts` moves the carried verdicts to the new selectors and removes the stale ones.");
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
