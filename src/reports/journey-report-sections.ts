// report.html for `blindfold run`: verdict, effort, step table, findings linked
// to their step, and the transcript across every page the journey visited.

import type { AudioReplayResult } from "../audio/audio-replay-writer.ts";
import { describeViewport } from "../browser/viewport-presets.ts";
import { neverReachedHint } from "../journeys/never-reached-messages.ts";
import type { EffortSummary } from "../metrics/effort-calculator.ts";
import { summarizeFinding } from "../rules/rule-catalog.ts";
import type { JourneyResult, JourneyStepResult } from "../types/journey-result-types.ts";
import type { Finding } from "../types/scan-result-types.ts";
import {
  buildAudioSection,
  buildFindingsSection,
  buildScrollableTable,
  buildSummaryNumbers,
  describeEngine,
  escapeHtml,
  pluralize,
  readableDate,
  renderReportPage,
} from "./html-report-builder.ts";

export function journeyVerdict(result: JourneyResult): string {
  if (result.outcome === "blocked") return `Journey blocked at step ${result.blockedAtStep}`;
  if (result.outcome === "completed-with-barriers") return `Journey completed with ${pluralize(result.barrierCount, "barrier", "barriers")}`;
  return "Journey completed";
}

export function describeEffort(effort: EffortSummary): string {
  const ratio = effort.ratio === null ? "no clicks to compare" : `${effort.ratio}×`;
  const totals = `${pluralize(effort.keyboardPresses, "key", "keys")} vs ${pluralize(effort.mouseClicks, "click", "clicks")} (${ratio})`;
  return effort.untilBlocked ? `${totals}, until blocked` : totals;
}

const STATUS_LABELS: Record<JourneyStepResult["status"], string> = {
  passed: "passed",
  "passed-with-barriers": "passed with barriers",
  failed: "failed (journey blocked)",
  "not-run": "not run",
};

function describeStepResult(step: JourneyStepResult, findings: Finding[]): string {
  const lines: string[] = [];
  if (step.blockedBecause) lines.push(step.blockedBecause);
  const hint = neverReachedHint(step);
  if (hint) lines.push(hint);
  if (hint?.startsWith("Did you mean") && step.closestMatches && step.closestMatches.length > 1) {
    lines.push(`Other close matches: ${step.closestMatches.slice(1).map((match) => `"${match}"`).join(", ")}`);
  }
  for (const finding of findings) lines.push(`${finding.ruleId}: ${summarizeFinding(finding)}`);
  for (const failure of step.expectationFailures) lines.push(failure.message);
  if (step.navigatedTo) lines.push(`Opened ${step.navigatedTo}`);
  if (step.openedNewTab) lines.push(`Opened a new tab: ${step.openedNewTab}`);
  const details = lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  return `<span class="status-${step.status}">${escapeHtml(STATUS_LABELS[step.status])}</span>${details ? `<ul>${details}</ul>` : ""}`;
}

function buildStepTable(result: JourneyResult): string {
  const rows = result.steps
    .map((step) => {
      const stepFindings = result.findings.filter((finding) => finding.journeyStep === step.stepNumber);
      const keys = step.keysPressed.length > 0 ? `${step.keysPressed.length}: ${step.keysPressed.join(" ")}` : "0";
      const spoken = step.announcements.length > 0 ? step.announcements.map((phrase) => escapeHtml(phrase)).join("<br>") : "—";
      return `<tr><th scope="row" id="step-${step.stepNumber}">${step.stepNumber}</th><td>${escapeHtml(step.action)}</td><td>${escapeHtml(keys)}</td><td>${spoken}</td><td>${describeStepResult(step, stepFindings)}</td></tr>`;
    })
    .join("");
  return buildScrollableTable("steps-caption", "Journey steps", ["Step", "Action", "Keys pressed", "What the screen reader said", "Result"], rows);
}

function buildEffortSection(result: JourneyResult): string {
  const { effort } = result;
  const perStep = effort.perStep
    .map(
      (step) =>
        `<tr><th scope="row">${step.stepNumber}</th><td>${step.keyboardPresses}</td><td>${step.mouseClicks}</td><td>${step.ratio === null ? "—" : `${step.ratio}×`}</td></tr>`,
    )
    .join("");
  return `${buildSummaryNumbers([
    ["Barriers", result.barrierCount],
    ["Key presses", effort.keyboardPresses],
    ["Mouse clicks", effort.mouseClicks],
    ["Effort ratio", effort.ratio === null ? "—" : `${effort.ratio}×`],
  ])}
    <p>A keyboard user needed ${escapeHtml(describeEffort(effort))}.</p>
    <p>The ratio counts Tab navigation. Screen reader users can also jump by headings and landmarks, so their real effort can be lower; it's still a strong signal of how hard the page is to use by keyboard.</p>
    <div class="table-wrapper"><table>
      <caption>Effort per step</caption>
      <thead><tr><th scope="col">Step</th><th scope="col">Key presses</th><th scope="col">Mouse clicks</th><th scope="col">Ratio</th></tr></thead>
      <tbody>${perStep}</tbody></table></div>`;
}

function buildJourneyTranscript(result: JourneyResult): string {
  const rows = result.transcript
    .map((entry) => {
      if (entry.kind === "page") {
        const label = entry.openedBy === "new-tab" ? "New tab loaded" : "Page loaded";
        const title = entry.title ? ` (${entry.title})` : "";
        return `<tr class="page-row"><th scope="row">${entry.journeyStep}</th><td colspan="2">${label}: ${escapeHtml(entry.text)}${escapeHtml(title)}</td></tr>`;
      }
      if (entry.kind === "focus") {
        return `<tr><th scope="row">${entry.journeyStep}</th><td>Tab to ${escapeHtml(entry.text)}</td><td>${escapeHtml(entry.spoken ?? "")}</td></tr>`;
      }
      if (entry.kind === "key") {
        return `<tr><th scope="row">${entry.journeyStep}</th><td>Pressed ${escapeHtml(entry.text)}</td><td>${escapeHtml(entry.spoken ?? "")}</td></tr>`;
      }
      if (entry.kind === "typed") {
        return `<tr><th scope="row">${entry.journeyStep}</th><td>Typed "${escapeHtml(entry.text)}"</td><td></td></tr>`;
      }
      if (entry.kind === "note") {
        return `<tr><th scope="row">${entry.journeyStep}</th><td colspan="2">${escapeHtml(entry.text)}</td></tr>`;
      }
      return `<tr><th scope="row">${entry.journeyStep}</th><td></td><td>${escapeHtml(entry.text)}</td></tr>`;
    })
    .join("");
  return `<p>Every page, key press and announcement in order. Page changes and frame boundaries are marked.</p>
    ${buildScrollableTable("transcript-caption", "Journey transcript", ["Step", "What happened", "Screen reader said"], rows)}`;
}

export function buildJourneyHtmlReport(result: JourneyResult, screenshots: Map<Finding, string>, audio: AudioReplayResult | null = null): string {
  const verdictText = journeyVerdict(result);
  const audioSection = buildAudioSection(audio);
  return renderReportPage({
    pageTitle: `${verdictText} · Blindfold journey · ${result.journeyName}`,
    verdictText,
    passed: result.outcome === "passed",
    verdictDetails: `<p>Journey: ${escapeHtml(result.journeyName)}</p>
      <p>Start page: <a href="${escapeHtml(result.startUrl)}">${escapeHtml(result.startUrl)}</a></p>
      <p>Run: <time datetime="${escapeHtml(result.scannedAt)}">${escapeHtml(readableDate(result.scannedAt))}</time></p>`,
    sections: [
      { id: "summary", title: "Effort", html: buildEffortSection(result) },
      ...(audioSection ? [audioSection] : []),
      { id: "steps", title: "Steps", html: buildStepTable(result) },
      { id: "findings", title: "Findings", html: buildFindingsSection(result.findings, screenshots) },
      { id: "transcript", title: "Full transcript", html: buildJourneyTranscript(result) },
    ],
    runDetails: [
      ["Blindfold version", result.toolVersion],
      ["Journey file", result.journeyFile],
      ["Engine", describeEngine(result.engine)],
      ["Viewport", describeViewport(result.viewport)],
      ["Final page", result.finalUrl],
      ["Duration", `${(result.durationMilliseconds / 1000).toFixed(1)} s`],
    ],
  });
}
