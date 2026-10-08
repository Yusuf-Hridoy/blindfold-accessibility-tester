// Command line entry point: `npm run blindfold -- scan <url>` and `run <journey.yaml>`.
// Exit codes: 0 no findings · 1 findings (or journey blocked) · 2 Blindfold couldn't complete.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import type { Browser } from "playwright";
import { launchBrowser } from "../browser/browser-launcher.ts";
import { loadJourneyFile } from "../journeys/journey-file-loader.ts";
import { JourneyFileError } from "../journeys/journey-file-schema.ts";
import { runJourney, type JourneyRunOutcome } from "../journeys/journey-runner.ts";
import { groupFindings, summarizeFinding } from "../rules/rule-catalog.ts";
import { buildHtmlReport, describeEngine, describeStopReason, pluralize } from "../reports/html-report-builder.ts";
import { buildJsonReport } from "../reports/json-report-builder.ts";
import { buildJourneyHtmlReport, describeEffort, journeyVerdict } from "../reports/journey-report-sections.ts";
import { runWithTimeLimit, TimeLimitError } from "../runtime/time-limit.ts";
import { describeError, ScanFailedError, scanPage, type ScanOutcome } from "../scan/page-scanner.ts";
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
}

interface RunCommandOptions {
  baseUrl?: string;
  output: string;
  maxTabsPerStep: number;
  pageTimeout: number;
  timeLimit: number;
  screenshots: boolean;
}

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

/** Relative to the current folder when inside it, otherwise absolute (never "../../.."). */
function displayPath(absolutePath: string): string {
  const relativePath = path.relative(process.cwd(), absolutePath);
  return relativePath.startsWith("..") || path.isAbsolute(relativePath) ? absolutePath : relativePath;
}

async function writeReports(outputOption: string, json: string, html: string): Promise<string> {
  const outputFolder = path.resolve(outputOption);
  try {
    await mkdir(outputFolder, { recursive: true });
    await writeFile(path.join(outputFolder, "report.json"), json);
    await writeFile(path.join(outputFolder, "report.html"), html);
  } catch (error) {
    throw new ScanFailedError(`Couldn't write the reports to ${outputFolder} (${describeError(error)}). Check the --output folder.`);
  }
  return displayPath(path.join(outputFolder, "report.html"));
}

/**
 * Launches the browser and runs `work` within the time limit. On time-out the
 * browser is closed (so nothing keeps running) and TimeLimitError is thrown.
 */
async function withBrowserAndTimeLimit<T>(seconds: number, work: (browser: Browser) => Promise<T>): Promise<T> {
  let browser: Browser;
  try {
    browser = await launchBrowser();
  } catch (error) {
    throw new ScanFailedError(`Couldn't start Chromium (${describeError(error)}). Run "npx playwright install chromium" and try again.`);
  }
  try {
    return await runWithTimeLimit(seconds, () => work(browser), () => browser.close());
  } finally {
    await browser.close().catch(() => {});
  }
}

function printScanSummary(outcome: ScanOutcome, reportPath: string): void {
  const { result } = outcome;
  console.log(`Blindfold ${TOOL_VERSION} · scan · ${result.url}`);
  console.log(`Engine: ${describeEngine(result.engine)}\n`);

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
}

function printJourneySummary(outcome: JourneyRunOutcome, reportPath: string): void {
  const { result } = outcome;
  console.log(`Blindfold ${TOOL_VERSION} · run · ${result.journeyName}`);
  console.log(`Engine: ${describeEngine(result.engine)}\n`);

  for (const step of result.steps) {
    const label = `step ${step.stepNumber}`;
    if (step.status === "not-run") {
      console.log(`  – ${label}  ${step.action}  (not run)`);
      continue;
    }
    const keys = pluralize(step.keysPressed.length, "key", "keys");
    console.log(`  ${step.status === "failed" ? "✗" : "✓"} ${label}  ${step.action.padEnd(48)} ${keys}`);
    if (step.blockedBecause) console.log(`  ✗ ${label}  blocked: ${step.blockedBecause}`);
    for (const finding of result.findings.filter((candidate) => candidate.journeyStep === step.stepNumber)) {
      console.log(`  ✗ ${label}  ${finding.ruleId} ${summarizeFinding(finding)}`);
    }
    for (const failure of step.expectationFailures) console.log(`  ✗ ${label}  ${failure.message}`);
  }

  const seconds = (result.durationMilliseconds / 1000).toFixed(1);
  console.log(`\n  ${journeyVerdict(result)} · effort ${describeEffort(result.effort)} · ${seconds}s`);
  console.log(`  Report: ${reportPath}`);
}

async function runScanCommand(url: string, options: ScanCommandOptions): Promise<number> {
  const outcome = await withBrowserAndTimeLimit(options.timeLimit, (browser) =>
    scanPage({ url, browser, maxTabs: options.maxTabs, pageTimeoutSeconds: options.pageTimeout, screenshots: options.screenshots }),
  );
  const reportPath = await writeReports(options.output, buildJsonReport(outcome.result), buildHtmlReport(outcome.result, outcome.screenshots));
  printScanSummary(outcome, reportPath);
  return outcome.result.findings.length > 0 ? EXIT_FINDINGS : EXIT_NO_FINDINGS;
}

async function runJourneyCommand(journeyFile: string, options: RunCommandOptions): Promise<number> {
  const journey = await loadJourneyFile(journeyFile, options.baseUrl);
  const outcome = await withBrowserAndTimeLimit(options.timeLimit, (browser) =>
    runJourney({
      journey,
      browser,
      maxTabsPerStep: options.maxTabsPerStep,
      pageTimeoutSeconds: options.pageTimeout,
      screenshots: options.screenshots,
    }),
  );
  const reportPath = await writeReports(
    options.output,
    buildJsonReport(outcome.result),
    buildJourneyHtmlReport(outcome.result, outcome.screenshots),
  );
  printJourneySummary(outcome, reportPath);
  return outcome.result.outcome === "passed" ? EXIT_NO_FINDINGS : EXIT_FINDINGS;
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
    .exitOverride()
    .action(async (journeyFile: string, options: RunCommandOptions) => {
      setExitCode(await runJourneyCommand(journeyFile, options));
    });

  return program;
}

async function main(): Promise<void> {
  let exitCode = EXIT_NO_FINDINGS;
  const commandName = process.argv[2] === "run" ? "journey" : "scan";
  try {
    await buildProgram((code) => {
      exitCode = code;
    }).parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      // Commander has already printed its message. Help and version are not failures.
      const isInformational = error.code === "commander.helpDisplayed" || error.code === "commander.version";
      exitCode = isInformational ? EXIT_NO_FINDINGS : EXIT_TOOL_ERROR;
    } else if (error instanceof TimeLimitError || error instanceof JourneyFileError) {
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
