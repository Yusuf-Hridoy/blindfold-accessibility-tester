// `npm run corpus:report`: writes corpus/CORPUS-REPORT.md from
// corpus/latest-results.json, corpus/previous-results.json (if any) and
// corpus/triage-verdicts.json. Offline; reads nothing from the network.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CorpusResults, TriageVerdicts } from "./corpus-result-types.ts";
import { buildCorpusReport } from "./corpus-report-markdown.ts";

const CORPUS_FOLDER = path.join(import.meta.dirname, "..", "corpus");

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(CORPUS_FOLDER, file), "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`corpus/${file} can't be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

try {
  const latest = await readJson<CorpusResults>("latest-results.json");
  if (!latest) {
    console.error("corpus/latest-results.json doesn't exist yet. Run `npm run corpus` first.");
    process.exitCode = 2;
  } else {
    const previous = await readJson<CorpusResults>("previous-results.json");
    const verdicts = (await readJson<TriageVerdicts>("triage-verdicts.json")) ?? {};
    await writeFile(path.join(CORPUS_FOLDER, "CORPUS-REPORT.md"), buildCorpusReport(latest, previous, verdicts));
    console.log("Wrote corpus/CORPUS-REPORT.md");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
