// Used by action.yml: reads the run's report.json (and comparison.json, when a
// baseline was compared) and appends the job summary to $GITHUB_STEP_SUMMARY.
// Usage: node write-job-summary.js <output-folder> <exit-code> <artifact-name>

import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { ReportComparison } from "../compare/report-comparison.ts";
import type { JourneyResult } from "../types/journey-result-types.ts";
import type { ScanResult } from "../types/scan-result-types.ts";
import { buildJobSummary } from "./job-summary-builder.ts";

async function readJsonIfPresent<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

const [outputFolder = "blindfold-results", exitCode = "2", artifactName = "blindfold-results"] = process.argv.slice(2);
const summary = buildJobSummary({
  report: await readJsonIfPresent<ScanResult | JourneyResult>(path.join(outputFolder, "report.json")),
  comparison: await readJsonIfPresent<ReportComparison>(path.join(outputFolder, "comparison.json")),
  exitCode: Number(exitCode),
  artifactName,
});
const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) await appendFile(summaryFile, summary);
else process.stdout.write(summary);
