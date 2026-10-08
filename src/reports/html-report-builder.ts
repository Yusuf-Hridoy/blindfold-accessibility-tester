// report.html: one self-contained, offline, accessible page. Every value that
// came from the scanned page is HTML-escaped, so a hostile page can't inject
// markup or script into the report.

import { readFileSync } from "node:fs";
import path from "node:path";
import { groupFindings } from "../rules/rule-catalog.ts";
import type {
  Finding,
  FocusStop,
  FocusVisibility,
  ScanResult,
  TranscriptLine,
  WalkStopReason,
} from "../types/scan-result-types.ts";

const TEMPLATE_PATH = path.join(import.meta.dirname, "html-report-template.html");

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function describeEngine(result: ScanResult): string {
  return result.engine.name === "guidepup-virtual-screen-reader"
    ? "Guidepup virtual screen reader"
    : `Accessibility snapshot fallback (${result.engine.fallbackReason ?? "Guidepup unavailable"})`;
}

export function describeStopReason(reason: WalkStopReason, maxTabs: number): string {
  switch (reason) {
    case "cycle-complete":
      return "Focus returned to the first element (full cycle).";
    case "end-of-page":
      return "Focus reached the end of the page.";
    case "focus-trap":
      return "Focus got trapped (see BF-003).";
    case "max-tabs":
      return `Endless content or very long page, scan stopped at ${maxTabs}.`;
    case "no-focusable-elements":
      return "The page has nothing the keyboard can focus.";
  }
}

function describeFocusVisibility(value: FocusVisibility): string {
  return value === "unknown" ? "unknown" : value ? "yes" : "no";
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildSummary(result: ScanResult): string {
  const rulesFailed = new Set(result.findings.map((finding) => finding.ruleId)).size;
  const numbers = [
    ["Barriers", result.findings.length],
    ["Rules failed", rulesFailed],
    ["Focus stops", result.focusStops.length],
  ] as const;
  const items = numbers.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  const stopNote =
    result.stoppedBecause === "max-tabs"
      ? `<p class="note">${escapeHtml(describeStopReason(result.stoppedBecause, result.maxTabs))}</p>`
      : "";
  return `<dl class="summary-numbers">${items}</dl>${stopNote}`;
}

function buildTranscriptExcerpt(lines: TranscriptLine[], highlightStep: number | null): string {
  if (lines.length === 0) return "";
  const rows = lines
    .map((line) => {
      const rowClass = line.step === highlightStep ? ' class="highlight-row"' : "";
      return `<tr${rowClass}><th scope="row">${line.step}</th><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.announcement)}</td></tr>`;
    })
    .join("");
  return `<div class="table-wrapper"><table>
    <caption>Transcript around step ${highlightStep ?? ""}</caption>
    <thead><tr><th scope="col">Step</th><th scope="col">Element</th><th scope="col">Screen reader said</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function buildFinding(finding: Finding, screenshot: string | undefined): string {
  const image = screenshot
    ? `<img src="data:image/png;base64,${screenshot}" alt="Screenshot of ${escapeHtml(finding.description)}">`
    : "";
  const stepText = finding.step === null ? "Never reached by the keyboard." : `Focus stop ${finding.step}.`;
  const cycle = finding.trapCycle
    ? `<p>Focus cycles between: ${finding.trapCycle.map((element) => `<code>${escapeHtml(element.selector)}</code>`).join(" → ")}</p>`
    : "";
  return `<article class="finding">
    <h4>${escapeHtml(finding.description)}</h4>
    <p>Selector: <code>${escapeHtml(finding.selector)}</code></p>
    <p>${stepText}</p>
    ${cycle}
    ${image}
    ${buildTranscriptExcerpt(finding.transcriptExcerpt, finding.step)}
  </article>`;
}

function buildFindings(result: ScanResult, screenshots: Map<Finding, string>): string {
  if (result.findings.length === 0) return "<p>No barriers found by the rules in this version.</p>";
  return groupFindings(result.findings)
    .map(
      (group) => `<section class="rule" aria-labelledby="rule-${group.key}">
      <h3 id="rule-${group.key}">${group.ruleId} · ${escapeHtml(group.title)} (${pluralize(group.findings.length, "element", "elements")})</h3>
      <dl class="rule-facts">
        <dt>WCAG</dt><dd>${escapeHtml(group.wcag)}</dd>
        <dt>Why it matters</dt><dd>${escapeHtml(group.whyItMatters)}</dd>
        <dt>How to fix it</dt><dd>${escapeHtml(group.fixHint)}</dd>
      </dl>
      ${group.findings.map((finding) => buildFinding(finding, screenshots.get(finding))).join("")}
    </section>`,
    )
    .join("");
}

function buildNotTested(result: ScanResult): string {
  if (result.notTested.length === 0) return "<p>Nothing was skipped. Every element a mouse can use was checked.</p>";
  const rows = result.notTested
    .map(
      (element) =>
        `<tr><td>${escapeHtml(element.description)}</td><td><code>${escapeHtml(element.selector)}</code></td><td>${escapeHtml(element.reason)}</td></tr>`,
    )
    .join("");
  return `<p>The keyboard walk stopped early, so these elements could not be checked.</p>
    <div class="table-wrapper"><table>
    <caption>Elements not tested</caption>
    <thead><tr><th scope="col">Element</th><th scope="col">Selector</th><th scope="col">Reason</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function buildTranscript(focusStops: FocusStop[]): string {
  if (focusStops.length === 0) return "<p>The keyboard never reached any element.</p>";
  const rows = focusStops
    .map((stop) => {
      const visibility = describeFocusVisibility(stop.focusVisible);
      const visibilityCell = visibility === "no" ? `<td class="focus-no">no</td>` : `<td>${visibility}</td>`;
      return `<tr><th scope="row">${stop.step}</th><td>${escapeHtml(stop.description)}</td><td>${escapeHtml(stop.announcement)}</td>${visibilityCell}</tr>`;
    })
    .join("");
  // The wrapper scrolls on narrow screens, so it must be reachable by keyboard too.
  return `<div class="table-wrapper" role="region" aria-labelledby="transcript-caption" tabindex="0"><table>
    <caption id="transcript-caption">Keyboard transcript</caption>
    <thead><tr><th scope="col">Step</th><th scope="col">Element</th><th scope="col">Screen reader said</th><th scope="col">Focus visible</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function buildRunDetails(result: ScanResult): string {
  const details = [
    ["Blindfold version", result.toolVersion],
    ["Engine", describeEngine(result)],
    ["Viewport", `${result.viewport.width} × ${result.viewport.height}`],
    ["Keyboard walk", describeStopReason(result.stoppedBecause, result.maxTabs)],
    ["Elements a mouse can use", String(result.mousePassElements.length)],
    ["Duration", `${(result.durationMilliseconds / 1000).toFixed(1)} s`],
  ];
  const items = details.map(([term, value]) => `<dt>${escapeHtml(term ?? "")}</dt><dd>${escapeHtml(value ?? "")}</dd>`).join("");
  return `<dl class="rule-facts">${items}</dl>`;
}

function fillTemplate(template: string, values: Record<string, string>): string {
  // A replacer function, so "$" in page text is never treated as a pattern.
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (placeholder, key: string) => values[key] ?? placeholder);
}

export function buildHtmlReport(result: ScanResult, screenshots: Map<Finding, string>): string {
  const barrierCount = result.findings.length;
  const verdictText = barrierCount === 0 ? "No barriers found" : `${pluralize(barrierCount, "barrier", "barriers")} found`;
  const template = readFileSync(TEMPLATE_PATH, "utf8");
  return fillTemplate(template, {
    PAGE_TITLE: escapeHtml(`${verdictText} · Blindfold report · ${result.url}`),
    VERDICT_CLASS: barrierCount === 0 ? "verdict-pass" : "verdict-fail",
    VERDICT_TEXT: escapeHtml(verdictText),
    SCANNED_URL: escapeHtml(result.url),
    SCANNED_AT_ISO: escapeHtml(result.scannedAt),
    SCANNED_AT_READABLE: escapeHtml(new Date(result.scannedAt).toUTCString()),
    SUMMARY: buildSummary(result),
    FINDINGS: buildFindings(result, screenshots),
    NOT_TESTED: buildNotTested(result),
    TRANSCRIPT: buildTranscript(result.focusStops),
    RUN_DETAILS: buildRunDetails(result),
  });
}
