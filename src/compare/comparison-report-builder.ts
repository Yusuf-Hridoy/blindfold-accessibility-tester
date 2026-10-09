// comparison.json and comparison.html for `blindfold compare`. The HTML uses
// the same template and style as the reports: no JavaScript, and every value
// that came from a scanned page is HTML-escaped.

import {
  buildScrollableTable,
  buildSummaryNumbers,
  escapeHtml,
  pluralize,
  readableDate,
  renderReportPage,
} from "../reports/html-report-builder.ts";
import type { ComparedFinding, ReportComparison, StillPresentFinding } from "./report-comparison.ts";

export function buildComparisonJson(comparison: ReportComparison): string {
  return `${JSON.stringify(comparison, null, 2)}\n`;
}

export function comparisonVerdict(comparison: ReportComparison): string {
  return comparison.totals.new === 0 ? "No new barriers" : `${pluralize(comparison.totals.new, "new barrier", "new barriers")}`;
}

function formatRatio(ratio: number | null): string {
  return ratio === null ? "—" : `${ratio}×`;
}

/** `selectorNote` is already-escaped HTML shown under the selector. */
function findingCells(finding: ComparedFinding, selectorNote = ""): string {
  const step = finding.journeyStep !== undefined ? `<td>${finding.journeyStep}</td>` : "";
  return `<td>${escapeHtml(finding.ruleId)}</td>${step}<td>${escapeHtml(finding.summary)}</td><td><code>${escapeHtml(finding.selector)}</code>${selectorNote}</td><td>${escapeHtml(finding.wcag)}</td>`;
}

function findingHeaders(kind: ReportComparison["kind"]): string[] {
  return kind === "journey" ? ["Rule", "Step", "Barrier", "Selector", "WCAG"] : ["Rule", "Barrier", "Selector", "WCAG"];
}

function buildFindingList(id: string, caption: string, findings: ComparedFinding[], kind: ReportComparison["kind"], emptyText: string): string {
  if (findings.length === 0) return `<p>${escapeHtml(emptyText)}</p>`;
  const rows = findings.map((finding) => `<tr>${findingCells(finding)}</tr>`).join("");
  return buildScrollableTable(`${id}-caption`, caption, findingHeaders(kind), rows);
}

function buildStillPresentList(comparison: ReportComparison): string {
  if (comparison.stillPresent.length === 0) return "<p>No barrier from the old report is still present.</p>";
  const rows = comparison.stillPresent
    .map((match: StillPresentFinding) => {
      const note = match.matchedBy === "description" ? `<br><small>Selector changed from <code>${escapeHtml(match.old.selector)}</code></small>` : "";
      return `<tr>${findingCells(match.new, note)}</tr>`;
    })
    .join("");
  return buildScrollableTable("still-present-caption", "Barriers still present", findingHeaders(comparison.kind), rows);
}

function buildSummary(comparison: ReportComparison): string {
  const journey = comparison.journey
    ? `<p>Journey: ${escapeHtml(comparison.journey.summary)}. Effort ratio: ${escapeHtml(formatRatio(comparison.journey.oldEffortRatio))} → ${escapeHtml(formatRatio(comparison.journey.newEffortRatio))}.</p>`
    : "";
  const warnings = comparison.warnings.map((warning) => `<p class="note">${escapeHtml(warning)}</p>`).join("");
  return `${buildSummaryNumbers([
    ["Fixed", comparison.totals.fixed],
    ["New", comparison.totals.new],
    ["Still present", comparison.totals.stillPresent],
  ])}${journey}${warnings}
    <p>Findings are matched by rule, reason and selector; when a selector changed, by rule, reason, element description and accessible name.</p>`;
}

export function buildComparisonHtml(comparison: ReportComparison): string {
  const verdictText = comparisonVerdict(comparison);
  const kindLabel = comparison.kind === "scan" ? "Page" : "Journey";
  const subject = (identity: ReportComparison["oldReport"]) =>
    comparison.kind === "scan" ? `<a href="${escapeHtml(identity.subject)}">${escapeHtml(identity.subject)}</a>` : escapeHtml(identity.subject);
  return renderReportPage({
    pageTitle: `${verdictText} · Blindfold comparison · ${comparison.newReport.subject}`,
    verdictText,
    passed: comparison.totals.new === 0,
    verdictDetails: `<p>${kindLabel}: ${subject(comparison.newReport)}</p>
      <p>Old report: <time datetime="${escapeHtml(comparison.oldReport.scannedAt)}">${escapeHtml(readableDate(comparison.oldReport.scannedAt))}</time> · New report: <time datetime="${escapeHtml(comparison.newReport.scannedAt)}">${escapeHtml(readableDate(comparison.newReport.scannedAt))}</time></p>`,
    sections: [
      { id: "summary", title: "Summary", html: buildSummary(comparison) },
      { id: "new", title: "New barriers", html: buildFindingList("new", "New barriers", comparison.new, comparison.kind, "No new barriers.") },
      { id: "fixed", title: "Fixed", html: buildFindingList("fixed", "Fixed barriers", comparison.fixed, comparison.kind, "No barrier from the old report was fixed.") },
      { id: "still-present", title: "Still present", html: buildStillPresentList(comparison) },
    ],
    runDetails: [
      ["Blindfold version", comparison.toolVersion],
      ["Old report", `${comparison.oldReport.file} (${kindLabel.toLowerCase()} ${comparison.oldReport.subject}, Blindfold ${comparison.oldReport.toolVersion})`],
      ["New report", `${comparison.newReport.file} (${kindLabel.toLowerCase()} ${comparison.newReport.subject}, Blindfold ${comparison.newReport.toolVersion})`],
      ["Compared", readableDate(comparison.comparedAt)],
    ],
  });
}
