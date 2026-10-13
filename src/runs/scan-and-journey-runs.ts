// Runs a scan or a journey in its own browser, within a time limit, and
// writes report.html, report.json and the audio replay. Shared by the CLI and
// the web UI. With `onProgress` it also sends the final progress event
// (run-finished, run-failed or run-cancelled).

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Browser } from "playwright";
import { AUDIO_FILE_NAME, writeAudioReplay, type AudioReplayResult } from "../audio/audio-replay-writer.ts";
import { journeyToAudioSegments, scanToAudioSegments, type AudioSegment } from "../audio/transcript-to-audio.ts";
import { launchBrowser } from "../browser/browser-launcher.ts";
import { launchOrExplainMissingBrowser, MissingBrowserError } from "../browser/missing-browser-check.ts";
import type { ViewportName } from "../browser/viewport-presets.ts";
import type { LoadedJourney } from "../journeys/journey-file-loader.ts";
import { runJourney, type JourneyRunOutcome } from "../journeys/journey-runner.ts";
import { buildHtmlReport, pluralize } from "../reports/html-report-builder.ts";
import { buildJourneyHtmlReport, journeyVerdict } from "../reports/journey-report-sections.ts";
import { buildJsonReport } from "../reports/json-report-builder.ts";
import { RunCancelledError, throwIfCancelled } from "../runtime/run-cancellation.ts";
import { describeRunFailure } from "../runtime/run-failure-message.ts";
import { runWithTimeLimit } from "../runtime/time-limit.ts";
import { describeError, ScanFailedError, scanPage, type ScanOutcome } from "../scan/page-scanner.ts";
import type { SessionState } from "../sessions/session-file-loader.ts";
import type { JourneyResult } from "../types/journey-result-types.ts";
import type { ProgressListener, RunKind, RunSummary } from "../types/progress-event-types.ts";
import type { Finding, ScanResult } from "../types/scan-result-types.ts";

/** The CLI's defaults, also used by the web UI. */
export const SCAN_DEFAULTS = { maxTabs: 400, pageTimeoutSeconds: 30, timeLimitSeconds: 120 } as const;
export const JOURNEY_DEFAULTS = { maxTabsPerStep: 100, pageTimeoutSeconds: 30, timeLimitSeconds: 300 } as const;

interface CommonRunOptions {
  /** Where report.html, report.json and the audio replay go. Created if needed. */
  outputFolder: string;
  pageTimeoutSeconds: number;
  timeLimitSeconds: number;
  screenshots: boolean;
  audio: boolean;
  session?: SessionState;
  onProgress?: ProgressListener;
  /** Cancels the run: the browser is closed at once and no report is written (RunCancelledError). */
  signal?: AbortSignal;
  /** Default true. See LaunchBrowserOptions. */
  closeBrowserOnSignals?: boolean;
}

export interface ScanRunOptions extends CommonRunOptions {
  url: string;
  maxTabs: number;
  viewport: ViewportName;
}

export interface JourneyRunWithReportsOptions extends CommonRunOptions {
  journey: LoadedJourney;
  maxTabsPerStep: number;
  /** Unset: the journey file's viewport, or desktop. */
  viewport?: ViewportName;
}

export interface CompletedRun<Outcome> {
  outcome: Outcome;
  /** Absolute paths. */
  outputFolder: string;
  reportPath: string;
  audio: AudioReplayResult | null;
}

/** The output folder, and whether this run created it (so a cancelled run can remove it again). */
export async function prepareOutputFolder(outputOption: string): Promise<{ folder: string; created: boolean }> {
  const folder = path.resolve(outputOption);
  try {
    const firstCreated = await mkdir(folder, { recursive: true });
    return { folder, created: firstCreated !== undefined };
  } catch (error) {
    throw new ScanFailedError(`Couldn't create the output folder ${folder} (${describeError(error)}). Check the --output folder.`);
  }
}

async function writeReports(outputFolder: string, json: string, html: string): Promise<string> {
  const reportPath = path.join(outputFolder, "report.html");
  try {
    await writeFile(path.join(outputFolder, "report.json"), json);
    await writeFile(reportPath, html);
  } catch (error) {
    throw new ScanFailedError(`Couldn't write the reports to ${outputFolder} (${describeError(error)}). Check the --output folder.`);
  }
  return reportPath;
}

/** Writes the audio replay, unless turned off. A replay from an earlier run is removed so the report never links a stale file. */
async function writeAudio(enabled: boolean, segments: () => AudioSegment[], outputFolder: string): Promise<AudioReplayResult | null> {
  const audio = enabled ? await writeAudioReplay(segments(), outputFolder) : null;
  if (audio?.status !== "written") await rm(path.join(outputFolder, AUDIO_FILE_NAME), { force: true }).catch(() => {});
  return audio;
}

/**
 * Launches the browser and runs `work` within the time limit. On time-out or
 * cancel the browser is closed at once, so nothing keeps running.
 */
async function withBrowserAndTimeLimit<T>(options: CommonRunOptions, work: (browser: Browser) => Promise<T>): Promise<T> {
  const { signal } = options;
  throwIfCancelled(signal);
  let browser: Browser;
  try {
    browser = await launchOrExplainMissingBrowser(() => launchBrowser({ closeOnSignals: options.closeBrowserOnSignals ?? true }));
  } catch (error) {
    if (error instanceof MissingBrowserError) throw error;
    throw new ScanFailedError(`Couldn't start Chromium (${describeError(error)}). Run "npx playwright install chromium" and try again.`);
  }
  const closeOnCancel = (): void => void browser.close().catch(() => {});
  signal?.addEventListener("abort", closeOnCancel, { once: true });
  try {
    throwIfCancelled(signal);
    return await runWithTimeLimit(options.timeLimitSeconds, () => work(browser), () => browser.close());
  } catch (error) {
    if (signal?.aborted) throw new RunCancelledError();
    throw error;
  } finally {
    signal?.removeEventListener("abort", closeOnCancel);
    await browser.close().catch(() => {});
  }
}

/** Writes audio and reports. A cancel during the (slow) audio step removes what this run wrote. */
async function writeRunFiles<Outcome>(
  options: CommonRunOptions,
  outcome: Outcome,
  segments: () => AudioSegment[],
  buildHtml: (audio: AudioReplayResult | null) => string,
  json: string,
): Promise<CompletedRun<Outcome>> {
  throwIfCancelled(options.signal);
  const { folder, created } = await prepareOutputFolder(options.outputFolder);
  const audio = await writeAudio(options.audio, segments, folder);
  if (options.signal?.aborted) {
    if (created) await rm(folder, { recursive: true, force: true }).catch(() => {});
    throw new RunCancelledError();
  }
  const reportPath = await writeReports(folder, json, buildHtml(audio));
  return { outcome, outputFolder: folder, reportPath, audio };
}

function countFailedRules(findings: Finding[]): number {
  return new Set(findings.map((finding) => finding.ruleId)).size;
}

export function summarizeScanResult(result: ScanResult): RunSummary {
  return {
    kind: "scan",
    subject: result.url,
    barrierCount: result.findings.length,
    rulesFailed: countFailedRules(result.findings),
    focusStops: result.focusStops.length,
    verdict: result.findings.length === 0 ? "No barriers found" : `${pluralize(result.findings.length, "barrier", "barriers")} found`,
    durationMilliseconds: result.durationMilliseconds,
  };
}

export function summarizeJourneyResult(result: JourneyResult): RunSummary {
  return {
    kind: "journey",
    subject: result.journeyName,
    barrierCount: result.barrierCount,
    rulesFailed: countFailedRules(result.findings),
    focusStops: result.steps.reduce((sum, step) => sum + step.focusStopsPassed, 0),
    outcome: result.outcome,
    verdict: journeyVerdict(result),
    durationMilliseconds: result.durationMilliseconds,
  };
}

/** Runs `work` and sends its final progress event. */
async function withFinalProgressEvent<Outcome>(
  kind: RunKind,
  onProgress: ProgressListener | undefined,
  summarize: (outcome: Outcome) => RunSummary,
  work: () => Promise<CompletedRun<Outcome>>,
): Promise<CompletedRun<Outcome>> {
  try {
    const run = await work();
    onProgress?.({
      type: "run-finished",
      summary: summarize(run.outcome),
      reportFolder: run.outputFolder,
      audioFileName: run.audio?.status === "written" ? run.audio.fileName : null,
    });
    return run;
  } catch (error) {
    onProgress?.(error instanceof RunCancelledError ? { type: "run-cancelled" } : { type: "run-failed", message: describeRunFailure(error, kind) });
    throw error;
  }
}

export function runScanWithReports(options: ScanRunOptions): Promise<CompletedRun<ScanOutcome>> {
  const { onProgress, signal } = options;
  return withFinalProgressEvent("scan", onProgress, (outcome: ScanOutcome) => summarizeScanResult(outcome.result), async () => {
    const outcome = await withBrowserAndTimeLimit(options, (browser) =>
      scanPage({
        url: options.url,
        browser,
        maxTabs: options.maxTabs,
        pageTimeoutSeconds: options.pageTimeoutSeconds,
        screenshots: options.screenshots,
        viewport: options.viewport,
        ...(options.session ? { session: options.session } : {}),
        ...(onProgress ? { onProgress } : {}),
        ...(signal ? { signal } : {}),
      }),
    );
    return writeRunFiles(
      options,
      outcome,
      () => scanToAudioSegments(outcome.result),
      (audio) => buildHtmlReport(outcome.result, outcome.screenshots, audio),
      buildJsonReport(outcome.result),
    );
  });
}

export function runJourneyWithReports(options: JourneyRunWithReportsOptions): Promise<CompletedRun<JourneyRunOutcome>> {
  const { onProgress, signal } = options;
  return withFinalProgressEvent("journey", onProgress, (outcome: JourneyRunOutcome) => summarizeJourneyResult(outcome.result), async () => {
    const outcome = await withBrowserAndTimeLimit(options, (browser) =>
      runJourney({
        journey: options.journey,
        browser,
        maxTabsPerStep: options.maxTabsPerStep,
        pageTimeoutSeconds: options.pageTimeoutSeconds,
        screenshots: options.screenshots,
        ...(options.viewport ? { viewport: options.viewport } : {}),
        ...(options.session ? { session: options.session } : {}),
        ...(onProgress ? { onProgress } : {}),
        ...(signal ? { signal } : {}),
      }),
    );
    return writeRunFiles(
      options,
      outcome,
      () => journeyToAudioSegments(outcome.result),
      (audio) => buildJourneyHtmlReport(outcome.result, outcome.screenshots, audio),
      buildJsonReport(outcome.result),
    );
  });
}
