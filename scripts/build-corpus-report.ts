// `npm run corpus:report`: writes corpus/CORPUS-REPORT.md from
// corpus/latest-results.json, corpus/previous-results.json (if any) and
// corpus/triage-verdicts.json. Offline; reads nothing from the network.
//
//   npm run corpus:report -- --tidy-verdicts   also rewrites triage-verdicts.json:
//     verdicts whose finding moved to a new selector follow it, and verdicts
//     matching nothing on the pages scanned in the latest run are removed.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExpectedBarrierFile } from "./build-bad-expected-barriers.ts";
import type { CorpusResults, TriageVerdicts } from "./corpus-result-types.ts";
import { tidyVerdicts } from "./corpus-report-maths.ts";
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
    let verdicts = (await readJson<TriageVerdicts>("triage-verdicts.json")) ?? {};
    if (process.argv.includes("--tidy-verdicts")) {
      const before = Object.keys(verdicts).length;
      verdicts = tidyVerdicts(latest, verdicts);
      await writeFile(path.join(CORPUS_FOLDER, "triage-verdicts.json"), `${JSON.stringify(verdicts, null, 2)}\n`);
      console.log(`Tidied corpus/triage-verdicts.json: ${before} -> ${Object.keys(verdicts).length} verdicts.`);
    }
    const expected = await readJson<ExpectedBarrierFile>("bad-expected-barriers.json");
    await writeFile(path.join(CORPUS_FOLDER, "CORPUS-REPORT.md"), buildCorpusReport(latest, previous, verdicts, expected));
    console.log("Wrote corpus/CORPUS-REPORT.md");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
