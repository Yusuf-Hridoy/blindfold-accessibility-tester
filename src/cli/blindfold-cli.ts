// Command line entry point: `npm run blindfold -- scan <url> [options]`.
// Exit codes: 0 no findings · 1 findings · 2 the scan could not be completed.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import { groupFindings } from "../rules/rule-catalog.ts";
import { buildHtmlReport, describeEngine, describeStopReason } from "../reports/html-report-builder.ts";
import { buildJsonReport } from "../reports/json-report-builder.ts";
import { ScanFailedError, scanPage, type ScanOutcome } from "../scan/page-scanner.ts";
import { TOOL_VERSION } from "../tool-version.ts";

const EXIT_NO_FINDINGS = 0;
const EXIT_FINDINGS = 1;
const EXIT_SCAN_FAILED = 2;

interface ScanCommandOptions {
  output: string;
  maxTabs: number;
  pageTimeout: number;
  screenshots: boolean;
}

function parsePositiveWholeNumber(value: string): number {
  const parsed = Number(value);
  if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("Use a whole number of 1 or more, e.g. --max-tabs 400.");
  }
  return parsed;
}

function parsePositiveSeconds(value: string): number {
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Use a number of seconds above 0, e.g. --page-timeout 30.");
  }
  return parsed;
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function printScanSummary(outcome: ScanOutcome, reportPath: string): void {
  const { result } = outcome;
  console.log(`Blindfold ${TOOL_VERSION} · scan · ${result.url}`);
  console.log(`Engine: ${describeEngine(result)}\n`);

  const groups = groupFindings(result.findings);
  if (groups.length === 0) {
    console.log("  ✓ No barriers found");
  }
  for (const group of groups) {
    console.log(`  ✗ ${group.ruleId}  ${group.title.padEnd(42)} ${pluralize(group.findings.length, "element", "elements")}`);
  }
  if (result.stoppedBecause === "max-tabs") {
    console.log(`\n  ! ${describeStopReason(result.stoppedBecause, result.maxTabs)}`);
  }
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

/** Relative to the current folder when inside it, otherwise absolute (never "../../.."). */
function displayPath(absolutePath: string): string {
  const relativePath = path.relative(process.cwd(), absolutePath);
  return relativePath.startsWith("..") || path.isAbsolute(relativePath) ? absolutePath : relativePath;
}

async function runScanCommand(url: string, options: ScanCommandOptions): Promise<number> {
  const outcome = await scanPage({
    url,
    maxTabs: options.maxTabs,
    pageTimeoutSeconds: options.pageTimeout,
    screenshots: options.screenshots,
  });

  const outputFolder = path.resolve(options.output);
  try {
    await mkdir(outputFolder, { recursive: true });
    await writeFile(path.join(outputFolder, "report.json"), buildJsonReport(outcome.result));
    await writeFile(path.join(outputFolder, "report.html"), buildHtmlReport(outcome.result, outcome.screenshots));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ScanFailedError(`Couldn't write the reports to ${outputFolder} (${reason}). Check the --output folder.`);
  }

  printScanSummary(outcome, displayPath(path.join(outputFolder, "report.html")));
  return outcome.result.findings.length > 0 ? EXIT_FINDINGS : EXIT_NO_FINDINGS;
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
    .option("--max-tabs <number>", "stop the keyboard walk after this many Tab presses", parsePositiveWholeNumber, 400)
    .option("--page-timeout <seconds>", "how long to wait for the page to load", parsePositiveSeconds, 30)
    .option("--no-screenshots", "don't capture element screenshots")
    .exitOverride()
    .action(async (url: string, options: ScanCommandOptions) => {
      setExitCode(await runScanCommand(url, options));
    });

  return program;
}

async function main(): Promise<void> {
  let exitCode = EXIT_NO_FINDINGS;
  try {
    await buildProgram((code) => {
      exitCode = code;
    }).parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      // Commander has already printed its message. Help and version are not failures.
      const isInformational = error.code === "commander.helpDisplayed" || error.code === "commander.version";
      exitCode = isInformational ? EXIT_NO_FINDINGS : EXIT_SCAN_FAILED;
    } else if (error instanceof ScanFailedError) {
      console.error(`Blindfold couldn't complete the scan. ${error.message}`);
      exitCode = EXIT_SCAN_FAILED;
    } else {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`Blindfold stopped unexpectedly: ${reason}`);
      exitCode = EXIT_SCAN_FAILED;
    }
  }
  process.exitCode = exitCode;
}

await main();
