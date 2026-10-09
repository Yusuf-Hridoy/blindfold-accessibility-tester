#!/usr/bin/env node
// Command line entry point: `blindfold scan <url>`, `run <journey.yaml>`,
// `compare <old> <new>` and `login <url> --save-session <file>`.
// Exit codes: 0 no findings · 1 findings (or journey blocked) · 2 Blindfold couldn't complete.

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import type { Browser } from "playwright";
import { AUDIO_FILE_NAME, writeAudioReplay, type AudioReplayResult } from "../audio/audio-replay-writer.ts";
import { journeyToAudioSegments, scanToAudioSegments, type AudioSegment } from "../audio/transcript-to-audio.ts";
import { launchBrowser } from "../browser/browser-launcher.ts";
import { launchOrExplainMissingBrowser, MissingBrowserError } from "../browser/missing-browser-check.ts";
import { buildComparisonHtml, buildComparisonJson } from "../compare/comparison-report-builder.ts";
import { compareReports, ComparisonError, loadReportFile, type ReportComparison } from "../compare/report-comparison.ts";
import { describeViewport, isViewportName, VIEWPORT_NAMES, type ViewportName } from "../browser/viewport-presets.ts";
import { loadJourneyFile } from "../journeys/journey-file-loader.ts";
import { JourneyFileError } from "../journeys/journey-file-schema.ts";
import { runJourney, type JourneyRunOutcome } from "../journeys/journey-runner.ts";
import { neverReachedHint } from "../journeys/never-reached-messages.ts";
import { groupFindings, summarizeFinding } from "../rules/rule-catalog.ts";
import { buildHtmlReport, describeEngine, describeStopReason, pluralize } from "../reports/html-report-builder.ts";
import { buildJsonReport } from "../reports/json-report-builder.ts";
import { buildJourneyHtmlReport, describeEffort, journeyVerdict } from "../reports/journey-report-sections.ts";
import { runWithTimeLimit, TimeLimitError } from "../runtime/time-limit.ts";
import { describeError, parseScanUrl, ScanFailedError, scanPage, type ScanOutcome } from "../scan/page-scanner.ts";
import { recordLoginSession } from "../sessions/login-session-recorder.ts";
import { loadSessionFile, SESSION_FILE_SUFFIX, SessionFileError, type SessionState } from "../sessions/session-file-loader.ts";
import { TOOL_VERSION } from "../tool-version.ts";

const EXIT_NO_FINDINGS = 0;
const EXIT_FINDINGS = 1;
const EXIT_TOOL_ERROR = 2;

interface ScanCommandOptions {
  output: string;
  maxTabs: number;
  pageTimeout: number;
  timeLimit: number;
  screenshots: boolean;
  audio: boolean;
  viewport: ViewportName;
  session?: string;
}

interface RunCommandOptions {
  baseUrl?: string;
  output: string;
  maxTabsPerStep: number;
  pageTimeout: number;
  timeLimit: number;
  screenshots: boolean;
  audio: boolean;
  /** Unset: the journey file's viewport, or desktop. */
  viewport?: ViewportName;
  session?: string;
}

interface CompareCommandOptions {
  output: string;
}

interface LoginCommandOptions {
  saveSession: string;
}

const SESSION_WARNING = "This file contains your login. Don't commit or share it.";

function parsePositiveWholeNumber(optionExample: string) {
  return (value: string): number => {
    const parsed = Number(value);
    if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(parsed) || parsed < 1) {
      throw new InvalidArgumentError(`Use a whole number of 1 or more, e.g. ${optionExample}.`);
    }
    return parsed;
  };
}

function parsePositiveSeconds(optionExample: string) {
  return (value: string): number => {
    const parsed = Number(value);
    if (value.trim() === "" || !Number.isFinite(parsed) || parsed <= 0) {
      throw new InvalidArgumentError(`Use a number of seconds above 0, e.g. ${optionExample}.`);
    }
    return parsed;
  };
}

function parseViewportName(value: string): ViewportName {
  if (!isViewportName(value)) throw new InvalidArgumentError(`Use ${VIEWPORT_NAMES.join(" or ")}, e.g. --viewport mobile.`);
  return value;
}

/** Relative to the current folder when inside it, otherwise absolute (never "../../.."). */
function displayPath(absolutePath: string): string {
  const relativePath = path.relative(process.cwd(), absolutePath);
  return relativePath.startsWith("..") || path.isAbsolute(relativePath) ? absolutePath : relativePath;
}

async function prepareOutputFolder(outputOption: string): Promise<string> {
  const outputFolder = path.resolve(outputOption);
  try {
    await mkdir(outputFolder, { recursive: true });
  } catch (error) {
    throw new ScanFailedError(`Couldn't create the output folder ${outputFolder} (${describeError(error)}). Check the --output folder.`);
  }
  return outputFolder;
}

async function writeReports(outputFolder: string, json: string, html: string): Promise<string> {
  try {
    await writeFile(path.join(outputFolder, "report.json"), json);
    await writeFile(path.join(outputFolder, "report.html"), html);
  } catch (error) {
    throw new ScanFailedError(`Couldn't write the reports to ${outputFolder} (${describeError(error)}). Check the --output folder.`);
  }
  return displayPath(path.join(outputFolder, "report.html"));
}

/** Writes the audio replay, unless --no-audio. A replay from an earlier run is removed so the report never links a stale file. */
async function writeAudio(enabled: boolean, segments: () => AudioSegment[], outputFolder: string): Promise<AudioReplayResult | null> {
  const audio = enabled ? await writeAudioReplay(segments(), outputFolder) : null;
  if (audio?.status !== "written") await rm(path.join(outputFolder, AUDIO_FILE_NAME), { force: true }).catch(() => {});
  return audio;
}

function printAudioLine(audio: AudioReplayResult | null): void {
  if (!audio) return;
  if (audio.status === "skipped") {
    console.log(`  Audio skipped: ${audio.reason}`);
    return;
  }
  console.log(`  Audio:  ${displayPath(audio.filePath)} (${audio.durationSeconds.toFixed(0)} s)`);
  for (const note of audio.notes) console.log(`  ! ${note}`);
}

async function loadSessionOption(sessionOption: string | undefined): Promise<SessionState | undefined> {
  return sessionOption === undefined ? undefined : loadSessionFile(sessionOption);
}

function printViewportLine(viewport: { width: number; height: number; name: ViewportName }): void {
  if (viewport.name !== "desktop") console.log(`Viewport: ${describeViewport(viewport)}`);
}

/**
 * Launches the browser and runs `work` within the time limit. On time-out the
 * browser is closed (so nothing keeps running) and TimeLimitError is thrown.
 */
async function withBrowserAndTimeLimit<T>(seconds: number, work: (browser: Browser) => Promise<T>): Promise<T> {
  let browser: Browser;
  try {
    browser = await launchOrExplainMissingBrowser(launchBrowser);
  } catch (error) {
    if (error instanceof MissingBrowserError) throw error;
    throw new ScanFailedError(`Couldn't start Chromium (${describeError(error)}). Run "npx playwright install chromium" and try again.`);
  }
  try {
    return await runWithTimeLimit(seconds, () => work(browser), () => browser.close());
  } finally {
    await browser.close().catch(() => {});
  }
}

function printScanSummary(outcome: ScanOutcome, reportPath: string, audio: AudioReplayResult | null): void {
  const { result } = outcome;
  console.log(`Blindfold ${TOOL_VERSION} · scan · ${result.url}`);
  console.log(`Engine: ${describeEngine(result.engine)}`);
  printViewportLine(result.viewport);
  console.log("");

  const groups = groupFindings(result.findings);
  if (groups.length === 0) console.log("  ✓ No barriers found");
  for (const group of groups) {
    console.log(`  ✗ ${group.ruleId}  ${group.title.padEnd(42)} ${pluralize(group.findings.length, "element", "elements")}`);
  }
  if (result.stoppedBecause === "max-tabs") console.log(`\n  ! ${describeStopReason(result.stoppedBecause, result.maxTabs)}`);
  if (result.notTested.length > 0) {
    console.log(`  ! ${pluralize(result.notTested.length, "element was", "elements were")} not tested (see the report).`);
  }

  const failedRuleCount = new Set(result.findings.map((finding) => finding.ruleId)).size;
  const seconds = (result.durationMilliseconds / 1000).toFixed(1);
  console.log(
    `\n  ${pluralize(failedRuleCount, "rule", "rules")} failed · ${pluralize(result.findings.length, "element", "elements")} · ` +
      `${pluralize(result.focusStops.length, "focus stop", "focus stops")} · ${seconds}s`,
  );
  console.log(`  Report: ${reportPath}`);
  printAudioLine(audio);
}

function printJourneySummary(outcome: JourneyRunOutcome, reportPath: string, audio: AudioReplayResult | null): void {
  const { result } = outcome;
  console.log(`Blindfold ${TOOL_VERSION} · run · ${result.journeyName}`);
  console.log(`Engine: ${describeEngine(result.engine)}`);
  printViewportLine(result.viewport);
  console.log("");

  for (const step of result.steps) {
    const label = `step ${step.stepNumber}`;
    if (step.status === "not-run") {
      console.log(`  – ${label}  ${step.action}  (not run)`);
      continue;
    }
    const keys = pluralize(step.keysPressed.length, "key", "keys");
    console.log(`  ${step.status === "failed" ? "✗" : "✓"} ${label}  ${step.action.padEnd(48)} ${keys}`);
    const indent = `  ${" ".repeat(label.length + 2)}  `;
    if (step.blockedBecause) console.log(`  ✗ ${label}  blocked: ${step.blockedBecause}`);
    const hint = neverReachedHint(step);
    if (hint) console.log(`${indent}${hint}`);
    if (step.openedNewTab) console.log(`${indent}Opened a new tab: ${step.openedNewTab}`);
    for (const finding of result.findings.filter((candidate) => candidate.journeyStep === step.stepNumber)) {
      console.log(`  ✗ ${label}  ${finding.ruleId} ${summarizeFinding(finding)}`);
    }
    for (const failure of step.expectationFailures) console.log(`  ✗ ${label}  ${failure.message}`);
  }

  const seconds = (result.durationMilliseconds / 1000).toFixed(1);
  console.log(`\n  ${journeyVerdict(result)} · effort ${describeEffort(result.effort)} · ${seconds}s`);
  console.log(`  Report: ${reportPath}`);
  printAudioLine(audio);
}

async function runScanCommand(url: string, options: ScanCommandOptions): Promise<number> {
  const session = await loadSessionOption(options.session);
  const outcome = await withBrowserAndTimeLimit(options.timeLimit, (browser) =>
    scanPage({
      url,
      browser,
      maxTabs: options.maxTabs,
      pageTimeoutSeconds: options.pageTimeout,
      screenshots: options.screenshots,
      viewport: options.viewport,
      ...(session ? { session } : {}),
    }),
  );
  const outputFolder = await prepareOutputFolder(options.output);
  const audio = await writeAudio(options.audio, () => scanToAudioSegments(outcome.result), outputFolder);
  const reportPath = await writeReports(outputFolder, buildJsonReport(outcome.result), buildHtmlReport(outcome.result, outcome.screenshots, audio));
  printScanSummary(outcome, reportPath, audio);
  return outcome.result.findings.length > 0 ? EXIT_FINDINGS : EXIT_NO_FINDINGS;
}

async function runJourneyCommand(journeyFile: string, options: RunCommandOptions): Promise<number> {
  const journey = await loadJourneyFile(journeyFile, options.baseUrl);
  const session = await loadSessionOption(options.session);
  const outcome = await withBrowserAndTimeLimit(options.timeLimit, (browser) =>
    runJourney({
      journey,
      browser,
      maxTabsPerStep: options.maxTabsPerStep,
      pageTimeoutSeconds: options.pageTimeout,
      screenshots: options.screenshots,
      ...(options.viewport ? { viewport: options.viewport } : {}),
      ...(session ? { session } : {}),
    }),
  );
  const outputFolder = await prepareOutputFolder(options.output);
  const audio = await writeAudio(options.audio, () => journeyToAudioSegments(outcome.result), outputFolder);
  const reportPath = await writeReports(
    outputFolder,
    buildJsonReport(outcome.result),
    buildJourneyHtmlReport(outcome.result, outcome.screenshots, audio),
  );
  printJourneySummary(outcome, reportPath, audio);
  return outcome.result.outcome === "passed" ? EXIT_NO_FINDINGS : EXIT_FINDINGS;
}

function formatRatio(ratio: number | null): string {
  return ratio === null ? "—" : `${ratio}×`;
}

function printComparisonSummary(comparison: ReportComparison, htmlPath: string): void {
  const { totals } = comparison;
  console.log(`Blindfold ${TOOL_VERSION} · compare`);
  for (const warning of comparison.warnings) console.log(`  ! ${warning}`);
  console.log(`  ✓ ${totals.fixed} fixed    ✗ ${totals.new} new    • ${totals.stillPresent} still present`);
  for (const finding of comparison.new) {
    const step = finding.journeyStep !== undefined ? ` (step ${finding.journeyStep})` : "";
    console.log(`  ✗ new  ${finding.ruleId}  ${finding.summary}${step}`);
  }
  if (comparison.journey) {
    const { summary, oldEffortRatio, newEffortRatio } = comparison.journey;
    console.log(`  Journey ${summary} · effort ${formatRatio(oldEffortRatio)} → ${formatRatio(newEffortRatio)}`);
  }
  console.log(`  Comparison: ${htmlPath}`);
}

async function runCompareCommand(oldFile: string, newFile: string, options: CompareCommandOptions): Promise<number> {
  const comparison = compareReports(await loadReportFile(oldFile), await loadReportFile(newFile), TOOL_VERSION);
  const outputFolder = await prepareOutputFolder(options.output);
  try {
    await writeFile(path.join(outputFolder, "comparison.json"), buildComparisonJson(comparison));
    await writeFile(path.join(outputFolder, "comparison.html"), buildComparisonHtml(comparison));
  } catch (error) {
    throw new ScanFailedError(`Couldn't write the comparison to ${outputFolder} (${describeError(error)}). Check the --output folder.`);
  }
  printComparisonSummary(comparison, displayPath(path.join(outputFolder, "comparison.html")));
  return comparison.totals.new > 0 ? EXIT_FINDINGS : EXIT_NO_FINDINGS;
}

async function runLoginCommand(url: string, options: LoginCommandOptions): Promise<number> {
  const pageUrl = parseScanUrl(url).href;
  console.log(`Blindfold ${TOOL_VERSION} · login · ${pageUrl}`);
  console.log("A browser window is open. Log in, then close the window to save your session.");
  const saved = await recordLoginSession(pageUrl, options.saveSession);
  console.log(`\n  Saved your login to ${displayPath(saved.filePath)} (${pluralize(saved.cookieCount, "cookie", "cookies")}).`);
  console.log(`  ! ${SESSION_WARNING}`);
  if (!saved.filePath.endsWith(SESSION_FILE_SUFFIX)) {
    console.log(`  ! Tip: name it something${SESSION_FILE_SUFFIX} so .gitignore keeps it out of git.`);
  }
  console.log(`  Use it with: npm run blindfold -- scan <url> --session ${displayPath(saved.filePath)}`);
  return EXIT_NO_FINDINGS;
}

function buildProgram(setExitCode: (code: number) => void): Command {
  const program = new Command()
    .name("blindfold")
    .description("Finds where keyboard and screen reader users get stuck on a web page.")
    .version(TOOL_VERSION)
    .exitOverride();

  program
    .command("scan")
    .description("Scan one page and write report.html and report.json.")
    .argument("<url>", "the page to scan, e.g. http://localhost:4000/")
    .option("--output <folder>", "where to write the reports", "./blindfold-results")
    .option("--max-tabs <number>", "stop the keyboard walk after this many Tab presses", parsePositiveWholeNumber("--max-tabs 400"), 400)
    .option("--page-timeout <seconds>", "how long to wait for the page to load", parsePositiveSeconds("--page-timeout 30"), 30)
    .option("--time-limit <seconds>", "stop the whole scan after this long", parsePositiveSeconds("--time-limit 120"), 120)
    .option("--no-screenshots", "don't capture element screenshots")
    .option("--no-audio", "don't write the audio replay (blindfold-audio.wav)")
    .option("--viewport <name>", `screen size to test at: ${VIEWPORT_NAMES.join(" or ")}`, parseViewportName, "desktop")
    .option("--session <file>", "load a login saved with the login command, e.g. --session my-site.session.json")
    .exitOverride()
    .action(async (url: string, options: ScanCommandOptions) => {
      setExitCode(await runScanCommand(url, options));
    });

  program
    .command("run")
    .description("Run a journey (YAML) with only a keyboard and write report.html and report.json.")
    .argument("<journey>", "the journey file, e.g. example-journeys/buggy-shop-cart-journey.yaml")
    .option("--base-url <url>", "site address for journeys whose start_url is a path, e.g. http://localhost:4000")
    .option("--output <folder>", "where to write the reports", "./blindfold-results")
    .option(
      "--max-tabs-per-step <number>",
      "give up reaching a step's target after this many Tab presses",
      parsePositiveWholeNumber("--max-tabs-per-step 100"),
      100,
    )
    .option("--page-timeout <seconds>", "how long to wait for each page to load", parsePositiveSeconds("--page-timeout 30"), 30)
    .option("--time-limit <seconds>", "stop the whole journey after this long", parsePositiveSeconds("--time-limit 300"), 300)
    .option("--no-screenshots", "don't capture element screenshots")
    .option("--no-audio", "don't write the audio replay (blindfold-audio.wav)")
    .option("--viewport <name>", `screen size to test at: ${VIEWPORT_NAMES.join(" or ")} (overrides the journey file)`, parseViewportName)
    .option("--session <file>", "load a login saved with the login command, e.g. --session my-site.session.json")
    .exitOverride()
    .action(async (journeyFile: string, options: RunCommandOptions) => {
      setExitCode(await runJourneyCommand(journeyFile, options));
    });

  program
    .command("compare")
    .description("Compare two report.json files (two scans or two journeys): fixed, new and still-present barriers.")
    .argument("<old-report>", "the earlier report.json")
    .argument("<new-report>", "the later report.json")
    .option("--output <folder>", "where to write comparison.html and comparison.json", "./blindfold-results")
    .exitOverride()
    .action(async (oldReport: string, newReport: string, options: CompareCommandOptions) => {
      setExitCode(await runCompareCommand(oldReport, newReport, options));
    });

  program
    .command("login")
    .description("Open a visible browser, log in by hand, close the window: saves the login for --session.")
    .argument("<url>", "the site's login page, e.g. https://example.com/login")
    .requiredOption("--save-session <file>", `where to save the login, e.g. my-site${SESSION_FILE_SUFFIX}`)
    .exitOverride()
    .action(async (url: string, options: LoginCommandOptions) => {
      setExitCode(await runLoginCommand(url, options));
    });

  return program;
}

async function main(): Promise<void> {
  let exitCode = EXIT_NO_FINDINGS;
  const commandNames: Record<string, string> = { run: "journey", login: "login", compare: "comparison" };
  const commandName = commandNames[process.argv[2] ?? ""] ?? "scan";
  try {
    await buildProgram((code) => {
      exitCode = code;
    }).parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      // Commander has already printed its message. Help and version are not failures.
      const isInformational = error.code === "commander.helpDisplayed" || error.code === "commander.version";
      exitCode = isInformational ? EXIT_NO_FINDINGS : EXIT_TOOL_ERROR;
    } else if (
      error instanceof TimeLimitError ||
      error instanceof JourneyFileError ||
      error instanceof SessionFileError ||
      error instanceof ComparisonError ||
      error instanceof MissingBrowserError
    ) {
      console.error(error.message);
      exitCode = EXIT_TOOL_ERROR;
    } else if (error instanceof ScanFailedError) {
      console.error(`Blindfold couldn't complete the ${commandName}. ${error.message}`);
      exitCode = EXIT_TOOL_ERROR;
    } else {
      console.error(`Blindfold stopped unexpectedly: ${describeError(error)}`);
      exitCode = EXIT_TOOL_ERROR;
    }
  }
  process.exitCode = exitCode;
}

await main();
