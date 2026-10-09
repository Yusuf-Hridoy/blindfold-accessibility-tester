// The GitHub Actions job summary (Markdown) for one Blindfold run: verdict,
// findings table, effort for journeys, comparison totals with a baseline.
// Element names come from the scanned page, so every cell is escaped: a page
// must not be able to break the table or inject markup into the summary.

import { describeEffort, journeyVerdict } from "../reports/journey-report-sections.ts";
import { findingTitle, RULE_CATALOG } from "../rules/rule-catalog.ts";
import type { ReportComparison } from "../compare/report-comparison.ts";
import type { JourneyResult } from "../types/journey-result-types.ts";
import type { Finding, ScanResult } from "../types/scan-result-types.ts";

export interface JobSummaryInput {
  /** null when Blindfold wrote no report. */
  report: ScanResult | JourneyResult | null;
  comparison: ReportComparison | null;
  /** Blindfold's exit code; 2 means it couldn't complete. */
  exitCode: number;
  artifactName: string;
}

const MAX_TABLE_ROWS = 50;

/** Text safe inside a Markdown table cell: no pipes, code spans, HTML, links, emphasis or line breaks. */
export function escapeMarkdownCell(text: string): string {
  return text
    .replace(/\r?\n|\r/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`|*_[\]#~])/g, "\\$1")
    .trim();
}

function isJourney(report: ScanResult | JourneyResult): report is JourneyResult {
  return "journeyName" in report;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function verdictLine(report: ScanResult | JourneyResult): string {
  if (isJourney(report)) {
    const icon = report.outcome === "passed" ? "✅" : "❌";
    return `${icon} **${escapeMarkdownCell(journeyVerdict(report))}** · journey: ${escapeMarkdownCell(report.journeyName)}`;
  }
  const count = report.findings.length;
  const verdict = count === 0 ? "✅ **No barriers found**" : `❌ **${plural(count, "barrier", "barriers")} found**`;
  return `${verdict} · ${escapeMarkdownCell(report.url)}`;
}

function findingsTable(findings: Finding[], withSteps: boolean): string[] {
  if (findings.length === 0) return [];
  const header = withSteps ? ["| Step | Rule | Barrier | Element | WCAG |", "|---|---|---|---|---|"] : ["| Rule | Barrier | Element | WCAG |", "|---|---|---|---|"];
  const rows = findings.slice(0, MAX_TABLE_ROWS).map((finding) => {
    const cells = [
      finding.ruleId,
      escapeMarkdownCell(finding.message ?? findingTitle(finding)),
      escapeMarkdownCell(finding.description),
      escapeMarkdownCell(RULE_CATALOG[finding.ruleId]?.wcag ?? ""),
    ];
    if (withSteps) cells.unshift(String(finding.journeyStep ?? ""));
    return `| ${cells.join(" | ")} |`;
  });
  const more = findings.length > MAX_TABLE_ROWS ? [``, `…and ${findings.length - MAX_TABLE_ROWS} more in the full report.`] : [];
  return ["", ...header, ...rows, ...more];
}

function comparisonLines(comparison: ReportComparison): string[] {
  const { totals } = comparison;
  const lines = ["", "### Compared with the baseline", "", `✓ ${totals.fixed} fixed · ✗ ${totals.new} new · • ${totals.stillPresent} still present`];
  if (comparison.journey) lines.push("", `Journey ${escapeMarkdownCell(comparison.journey.summary)}.`);
  for (const warning of comparison.warnings) lines.push("", `> ${escapeMarkdownCell(warning)}`);
  if (comparison.new.length > 0) {
    lines.push("", "| New | Rule | Barrier | WCAG |", "|---|---|---|---|");
    for (const finding of comparison.new.slice(0, MAX_TABLE_ROWS)) {
      lines.push(`| ✗ | ${finding.ruleId} | ${escapeMarkdownCell(finding.summary)} | ${escapeMarkdownCell(finding.wcag)} |`);
    }
  }
  return lines;
}

export function buildJobSummary(input: JobSummaryInput): string {
  const lines = ["## Blindfold accessibility check", ""];
  if (!input.report || input.exitCode === 2) {
    lines.push("⚠️ **Blindfold couldn't complete.** See the step's log for the reason.");
  } else {
    lines.push(verdictLine(input.report));
    if (isJourney(input.report)) lines.push("", `Effort: a keyboard user needed ${escapeMarkdownCell(describeEffort(input.report.effort))}.`);
    lines.push(...findingsTable(input.report.findings, isJourney(input.report)));
  }
  if (input.comparison) lines.push(...comparisonLines(input.comparison));
  lines.push("", `The full report (report.html, report.json${input.comparison ? ", comparison.html" : ""}) is in the **${escapeMarkdownCell(input.artifactName)}** artifact of this run.`, "");
  return lines.join("\n");
}
