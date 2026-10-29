// `npm run corpus`: scans every page of the real-world corpus, one at a time
// with a pause in between (to be polite to the sites), desktop, no audio, no
// screenshots, with the CLI's normal limits. Writes corpus/latest-results.json
// (the previous one becomes corpus/previous-results.json) and the raw reports
// to corpus/raw/. A page that can't be scanned is recorded with the reason;
// only a crash of this script itself exits non-zero (2).
//
//   npm run corpus                 every page
//   npm run corpus -- --only apg   one source: apg, bad or real (other sources keep their last
//                                  results, and previous-results.json stays the last full run)

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { describeRunFailure } from "../src/runtime/run-failure-message.ts";
import { runScanWithReports, SCAN_DEFAULTS } from "../src/runs/scan-and-journey-runs.ts";
import { TOOL_VERSION } from "../src/tool-version.ts";
import type { CorpusPage, CorpusPageResult, CorpusResults, CorpusSource } from "./corpus-result-types.ts";

const CORPUS_FOLDER = path.join(import.meta.dirname, "..", "corpus");
const LATEST_FILE = path.join(CORPUS_FOLDER, "latest-results.json");
const PREVIOUS_FILE = path.join(CORPUS_FOLDER, "previous-results.json");
const PAUSE_BETWEEN_PAGES_MILLISECONDS = 2_000;
/** Heavy real sites can take longer than a person's 30 s default to load; the scan time limit stays the same. */
const PAGE_TIMEOUT_SECONDS = 60;
/** A page that fails with a network error (not a slow or broken site) is tried once more after this pause. */
const NETWORK_RETRY_PAUSE_MILLISECONDS = 10_000;
const NETWORK_ERROR = /net::ERR_(INTERNET_DISCONNECTED|NETWORK_CHANGED|NAME_NOT_RESOLVED|CONNECTION_RESET|TIMED_OUT)/;

type SourceOption = "apg" | "bad" | "real";

const PAGE_LISTS: { option: SourceOption; file: string; sources: CorpusSource[]; sourceOf: (page: CorpusPage) => CorpusSource }[] = [
  { option: "apg", file: "apg-pattern-pages.json", sources: ["apg"], sourceOf: () => "apg" },
  {
    option: "bad",
    file: "bad-demo-pages.json",
    sources: ["bad-before", "bad-after"],
    sourceOf: (page) => (page.category === "after" ? "bad-after" : "bad-before"),
  },
  { option: "real", file: "real-site-pages.json", sources: ["real-site"], sourceOf: () => "real-site" },
];

function readOnlyOption(): SourceOption | null {
  const index = process.argv.indexOf("--only");
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (value === "apg" || value === "bad" || value === "real") return value;
  throw new Error(`--only takes apg, bad or real, not "${value ?? ""}".`);
}

/** e.g. "www-w3-org-wai-aria-apg-patterns-tabs-examples-tabs-manual" */
function folderNameFor(url: string): string {
  const { host, pathname } = new URL(url);
  return `${host}${pathname}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "page";
}

async function scanCorpusPage(page: CorpusPage, source: CorpusSource): Promise<CorpusPageResult> {
  const startedAt = Date.now();
  const base = { url: page.url, source, category: page.category, scannedAt: new Date(startedAt).toISOString() };
  try {
    const run = await runScanWithReports({
      url: page.url,
      outputFolder: path.join(CORPUS_FOLDER, "raw", source, folderNameFor(page.url)),
      ...SCAN_DEFAULTS,
      pageTimeoutSeconds: PAGE_TIMEOUT_SECONDS,
      viewport: "desktop",
      screenshots: false,
      audio: false,
    });
    const { result } = run.outcome;
    return {
      ...base,
      status: "scanned",
      stoppedBecause: result.stoppedBecause,
      focusStops: result.focusStops.length,
      warnings: result.warnings,
      durationMilliseconds: Date.now() - startedAt,
      findings: result.findings.map((finding) => ({
        url: page.url,
        ruleId: finding.ruleId,
        ...(finding.reason ? { reason: finding.reason } : {}),
        selector: finding.selector,
        description: finding.description,
        ...(finding.confidence ? { confidence: finding.confidence } : {}),
      })),
    };
  } catch (error) {
    return { ...base, status: "couldn't scan", reason: describeRunFailure(error, "scan"), durationMilliseconds: Date.now() - startedAt, findings: [] };
  }
}

async function readPreviousResults(): Promise<CorpusResults | null> {
  try {
    return JSON.parse(await readFile(LATEST_FILE, "utf8")) as CorpusResults;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const only = readOnlyOption();
  const lists = PAGE_LISTS.filter((list) => only === null || list.option === only);
  const pages: { page: CorpusPage; source: CorpusSource }[] = [];
  for (const list of lists) {
    const listed = JSON.parse(await readFile(path.join(CORPUS_FOLDER, list.file), "utf8")) as CorpusPage[];
    pages.push(...listed.map((page) => ({ page, source: list.sourceOf(page) })));
  }

  const previous = await readPreviousResults();
  const results: CorpusPageResult[] = [];
  for (const [index, { page, source }] of pages.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_PAGES_MILLISECONDS));
    let result = await scanCorpusPage(page, source);
    if (result.status === "couldn't scan" && NETWORK_ERROR.test(result.reason ?? "")) {
      await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_PAUSE_MILLISECONDS));
      result = await scanCorpusPage(page, source);
    }
    results.push(result);
    const outcome = result.status === "scanned" ? `${result.findings.length} findings` : `couldn't scan: ${result.reason}`;
    console.log(`[${index + 1}/${pages.length}] ${source.padEnd(10)} ${page.url}  ${outcome} (${(result.durationMilliseconds / 1000).toFixed(1)} s)`);
  }

  // A partial run (--only) keeps the other sources' last results, and leaves
  // previous-results.json alone: "previous" always means the last full run.
  const sourcesRun = new Set(lists.flatMap((list) => list.sources));
  const kept = (previous?.pages ?? []).filter((page) => !sourcesRun.has(page.source));
  if (previous && only === null) await rename(LATEST_FILE, PREVIOUS_FILE);
  const latest: CorpusResults = { generatedAt: new Date().toISOString(), toolVersion: TOOL_VERSION, pages: [...kept, ...results] };
  await writeFile(LATEST_FILE, `${JSON.stringify(latest, null, 2)}\n`);

  const scanned = results.filter((result) => result.status === "scanned");
  const findingCount = scanned.reduce((sum, result) => sum + result.findings.length, 0);
  console.log(`\nScanned ${scanned.length} of ${results.length} pages: ${findingCount} findings. Wrote corpus/latest-results.json.`);
  console.log("Next: npm run corpus:report");
}

try {
  await main();
} catch (error) {
  console.error(`The corpus run crashed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
