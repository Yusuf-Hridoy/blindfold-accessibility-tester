// report.html: one self-contained, offline, accessible page. Every value that
// came from the scanned page is HTML-escaped, so a hostile page can't inject
// markup or script into the report. Shared by scan and journey reports.

import { readFileSync } from "node:fs";
import path from "node:path";
import type { AudioReplayResult } from "../audio/audio-replay-writer.ts";
import { describeViewport } from "../browser/viewport-presets.ts";
import { groupFindings } from "../rules/rule-catalog.ts";
import type {
  Finding,
  FocusStop,
  FocusVisibility,
  ScanResult,
  TranscriptLine,
  WalkStopReason,
} from "../types/scan-result-types.ts";
import type { AnnouncerEngineName } from "../types/scan-result-types.ts";

const TEMPLATE_PATH = path.join(import.meta.dirname, "html-report-template.html");

export interface ReportSection {
  id: string;
  title: string;
  html: string;
}

export interface ReportPage {
  pageTitle: string;
  verdictText: string;
  passed: boolean;
  /** Already-escaped HTML lines under the verdict heading. */
  verdictDetails: string;
  sections: ReportSection[];
  runDetails: [string, string][];
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function describeEngine(engine: { name: AnnouncerEngineName; fallbackReason?: string }): string {
  return engine.name === "guidepup-virtual-screen-reader"
    ? "Guidepup virtual screen reader"
    : `Accessibility snapshot fallback (${engine.fallbackReason ?? "Guidepup unavailable"})`;
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

export function readableDate(isoDate: string): string {
  return new Date(isoDate).toUTCString();
}

function describeFocusVisibility(value: FocusVisibility): string {
  return value === "unknown" ? "unknown" : value ? "yes" : "no";
}

export function buildSummaryNumbers(numbers: [string, number | string][]): string {
  const items = numbers.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join("");
  return `<dl class="summary-numbers">${items}</dl>`;
}

function buildTranscriptExcerpt(lines: TranscriptLine[], highlightStep: number | null, caption: string): string {
  if (lines.length === 0) return "";
  const rows = lines
    .map((line) => {
      const rowClass = line.step === highlightStep && highlightStep !== null ? ' class="highlight-row"' : "";
      return `<tr${rowClass}><th scope="row">${line.step}</th><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.announcement)}</td></tr>`;
    })
    .join("");
  return `<div class="table-wrapper"><table>
    <caption>${escapeHtml(caption)}</caption>
    <thead><tr><th scope="col">Step</th><th scope="col">Element or key</th><th scope="col">Screen reader said</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function buildFinding(finding: Finding, screenshot: string | undefined): string {
  const image = screenshot
    ? `<img src="data:image/png;base64,${screenshot}" alt="Screenshot of ${escapeHtml(finding.description)}">`
    : "";
  const where =
    finding.journeyStep !== undefined
      ? `<p>Journey <a href="#step-${finding.journeyStep}">step ${finding.journeyStep}</a>.</p>`
      : `<p>${finding.step === null ? "Never reached by the keyboard." : `Focus stop ${finding.step}.`}</p>`;
  const message = finding.message ? `<p>${escapeHtml(finding.message)}</p>` : "";
  const confidence = finding.confidenceNote ? `<p class="confidence-note">${escapeHtml(finding.confidenceNote)}</p>` : "";
  const cycle = finding.trapCycle
    ? `<p>Focus cycles between: ${finding.trapCycle.map((element) => `<code>${escapeHtml(element.selector)}</code>`).join(" → ")}</p>`
    : "";
  const overlayControls = finding.overlayControls
    ? `<p>Controls in the overlay that the keyboard can't reach:</p><ul>${finding.overlayControls
        .map((control) => `<li>${escapeHtml(control.description)} (<code>${escapeHtml(control.selector)}</code>)</li>`)
        .join("")}</ul>`
    : "";
  const excerptCaption = finding.journeyStep !== undefined ? `What happened in step ${finding.journeyStep}` : `Transcript around step ${finding.step ?? ""}`;
  return `<article class="finding">
    <h4>${escapeHtml(finding.description)}</h4>
    <p>Selector: <code>${escapeHtml(finding.selector)}</code></p>
    ${where}
    ${message}
    ${confidence}
    ${cycle}
    ${overlayControls}
    ${image}
    ${buildTranscriptExcerpt(finding.transcriptExcerpt, finding.journeyStep === undefined ? finding.step : null, excerptCaption)}
  </article>`;
}

export function buildFindingsSection(findings: Finding[], screenshots: Map<Finding, string>): string {
  if (findings.length === 0) return "<p>No barriers found by the rules in this version.</p>";
  return groupFindings(findings)
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

/** A table inside a keyboard-reachable scroll region (it scrolls on narrow screens). */
export function buildScrollableTable(captionId: string, caption: string, headers: string[], rows: string): string {
  const headerCells = headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("");
  return `<div class="table-wrapper" role="region" aria-labelledby="${captionId}" tabindex="0"><table>
    <caption id="${captionId}">${escapeHtml(caption)}</caption>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

export function renderReportPage(page: ReportPage): string {
  const sectionLinks = [...page.sections, { id: "run-details", title: "Run details" }]
    .map((section) => `<li><a href="#${section.id}">${escapeHtml(section.title)}</a></li>`)
    .join("");
  const sections = page.sections
    .map(
      (section) => `<section id="${section.id}" aria-labelledby="${section.id}-heading"${section.id === "findings" ? ' tabindex="-1"' : ""}>
      <h2 id="${section.id}-heading">${escapeHtml(section.title)}</h2>
      ${section.html}
    </section>`,
    )
    .join("\n");
  const runDetails = `<dl class="rule-facts">${page.runDetails
    .map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("")}</dl>`;
  const values: Record<string, string> = {
    PAGE_TITLE: escapeHtml(page.pageTitle),
    VERDICT_CLASS: page.passed ? "verdict-pass" : "verdict-fail",
    VERDICT_TEXT: escapeHtml(page.verdictText),
    VERDICT_DETAILS: page.verdictDetails,
    SECTION_LINKS: sectionLinks,
    SECTIONS: sections,
    RUN_DETAILS: runDetails,
  };
  // A replacer function, so "$" in page text is never treated as a pattern.
  return readFileSync(TEMPLATE_PATH, "utf8").replace(/\{\{([A-Z_]+)\}\}/g, (placeholder, key: string) => values[key] ?? placeholder);
}

/**
 * The "Listen" section: a player for blindfold-audio.wav (kept as a separate
 * file so the report stays small), or why there is no audio. Null when audio
 * was turned off with --no-audio.
 */
export function buildAudioSection(audio: AudioReplayResult | null): ReportSection | null {
  if (!audio) return null;
  if (audio.status === "skipped") {
    return { id: "audio", title: "Listen", html: `<p class="note">Audio skipped: ${escapeHtml(audio.reason)}</p>` };
  }
  const notes = audio.notes.map((note) => `<p class="note">${escapeHtml(note)}</p>`).join("");
  const fileName = escapeHtml(audio.fileName);
  return {
    id: "audio",
    title: "Listen",
    html: `<p id="audio-label">Audio replay: what the screen reader said, a soft tick for every key press, and silence where an update should have been announced (${audio.durationSeconds.toFixed(0)} seconds).</p>
      <audio controls preload="none" src="${fileName}" aria-labelledby="audio-label"></audio>
      <p><a href="${fileName}">Download the audio file (${fileName}, ${(audio.sizeBytes / 1_000_000).toFixed(1)} MB)</a></p>${notes}`,
  };
}

// ---- Scan report ----

function buildScanSummary(result: ScanResult): string {
  const rulesFailed = new Set(result.findings.map((finding) => finding.ruleId)).size;
  const stopNote =
    result.stoppedBecause === "max-tabs"
      ? `<p class="note">${escapeHtml(describeStopReason(result.stoppedBecause, result.maxTabs))}</p>`
      : "";
  return (
    buildSummaryNumbers([
      ["Barriers", result.findings.length],
      ["Rules failed", rulesFailed],
      ["Focus stops", result.focusStops.length],
    ]) + stopNote
  );
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

function buildScanTranscript(focusStops: FocusStop[]): string {
  if (focusStops.length === 0) return "<p>The keyboard never reached any element.</p>";
  const rows = focusStops
    .map((stop) => {
      const visibility = describeFocusVisibility(stop.focusVisible);
      const visibilityCell = visibility === "no" ? `<td class="focus-no">no</td>` : `<td>${visibility}</td>`;
      const boundary = stop.frameBoundary;
      const said = boundary
        ? `${stop.announcement} ${boundary.tabPressesInside} Tab ${boundary.tabPressesInside === 1 ? "press" : "presses"} inside it.`
        : stop.announcement;
      return `<tr><th scope="row">${stop.step}</th><td>${escapeHtml(stop.description)}</td><td>${escapeHtml(said)}</td>${visibilityCell}</tr>`;
    })
    .join("");
  return `<p>Every Tab key press that moved focus, and what the screen reader said.</p>
    ${buildScrollableTable("transcript-caption", "Keyboard transcript", ["Step", "Element", "Screen reader said", "Focus visible"], rows)}`;
}

export function buildHtmlReport(result: ScanResult, screenshots: Map<Finding, string>, audio: AudioReplayResult | null = null): string {
  const audioSection = buildAudioSection(audio);
  const barrierCount = result.findings.length;
  const verdictText = barrierCount === 0 ? "No barriers found" : `${pluralize(barrierCount, "barrier", "barriers")} found`;
  return renderReportPage({
    pageTitle: `${verdictText} · Blindfold report · ${result.url}`,
    verdictText,
    passed: barrierCount === 0,
    verdictDetails: `<p>Page: <a href="${escapeHtml(result.url)}">${escapeHtml(result.url)}</a></p>
      <p>Scanned: <time datetime="${escapeHtml(result.scannedAt)}">${escapeHtml(readableDate(result.scannedAt))}</time></p>`,
    sections: [
      { id: "summary", title: "Summary", html: buildScanSummary(result) },
      ...(audioSection ? [audioSection] : []),
      { id: "findings", title: "Findings", html: buildFindingsSection(result.findings, screenshots) },
      { id: "not-tested", title: "Not tested", html: buildNotTested(result) },
      { id: "transcript", title: "Full transcript", html: buildScanTranscript(result.focusStops) },
    ],
    runDetails: [
      ["Blindfold version", result.toolVersion],
      ["Engine", describeEngine(result.engine)],
      ["Viewport", describeViewport(result.viewport)],
      ["Keyboard walk", describeStopReason(result.stoppedBecause, result.maxTabs)],
      ["Elements a mouse can use", String(result.mousePassElements.length)],
      ["Duration", `${(result.durationMilliseconds / 1000).toFixed(1)} s`],
    ],
  });
}
