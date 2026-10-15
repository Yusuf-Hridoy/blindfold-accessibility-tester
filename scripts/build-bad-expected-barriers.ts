// `npm run corpus:expected-bad`: writes corpus/bad-expected-barriers.json, the
// barriers Blindfold's rules should find on the W3C BAD "before" pages, so the
// corpus report can measure recall (how many real barriers are found), not
// only precision. Needs the network.
//
// The list comes from three WCAG failure techniques the BAD demo plants and
// that map to Blindfold's rules, applied to each "before" page; each is
// counted on the matching "after" page too, to confirm the fix removed it:
//   F55  script removes focus when it's received (onfocus="blur()")  -> BF-001
//   F65  an image link whose only content is an <img> without alt     -> BF-002
//   F68  a form field with no programmatic label                       -> BF-002
// Selectors come from Blindfold's own helper, so they match its findings.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createScanContext, launchBrowser } from "../src/browser/browser-launcher.ts";
import type { RuleId } from "../src/types/scan-result-types.ts";
import type { CorpusPage } from "./corpus-result-types.ts";

const CORPUS_FOLDER = path.join(import.meta.dirname, "..", "corpus");

export type WcagFailure = "F55" | "F65" | "F68";

export interface ExpectedBarrier {
  ruleId: RuleId;
  failure: WcagFailure;
  selector: string;
  description: string;
}

export interface ExpectedBarrierPage {
  url: string;
  afterUrl: string;
  expected: ExpectedBarrier[];
  /** The same failures on the "after" page: 0 confirms the fix removed them. */
  afterCounts: Record<WcagFailure, number>;
}

export interface ExpectedBarrierFile {
  generatedAt: string;
  note: string;
  pages: ExpectedBarrierPage[];
}

type Page = Awaited<ReturnType<Awaited<ReturnType<typeof createScanContext>>["newPage"]>>;

async function findFailures(page: Page): Promise<ExpectedBarrier[]> {
  return page.evaluate(() => {
    const helpers = window.__blindfoldElements;
    const found: { ruleId: "BF-001" | "BF-002"; failure: "F55" | "F65" | "F68"; selector: string; description: string }[] = [];
    const add = (element: Element, ruleId: "BF-001" | "BF-002", failure: "F55" | "F65" | "F68") =>
      found.push({ ruleId, failure, selector: helpers.selectorFor(element), description: helpers.describe(element) });
    const named = (element: Element) => ["aria-label", "aria-labelledby", "title"].some((attribute) => (element.getAttribute(attribute) ?? "").trim() !== "");

    for (const element of document.querySelectorAll("[onfocus]")) {
      if (/blur\s*\(/.test(element.getAttribute("onfocus") ?? "") && helpers.isVisible(element)) add(element, "BF-001", "F55");
    }
    for (const link of document.querySelectorAll("a[href]")) {
      const images = Array.from(link.querySelectorAll("img"));
      const onlyImagesWithoutAlt = images.length > 0 && images.every((image) => !image.hasAttribute("alt")) && (link.textContent ?? "").trim() === "";
      if (onlyImagesWithoutAlt && !named(link) && helpers.isVisible(link) && !/blur\s*\(/.test(link.getAttribute("onfocus") ?? "")) add(link, "BF-002", "F65");
    }
    const fields = document.querySelectorAll('input:not([type="hidden"], [type="submit"], [type="button"], [type="reset"], [type="image"]), select, textarea');
    for (const field of fields) {
      const labels = (field as HTMLInputElement).labels;
      if ((!labels || labels.length === 0) && !named(field) && helpers.isVisible(field)) add(field, "BF-002", "F68");
    }
    return found;
  });
}

function countByFailure(barriers: ExpectedBarrier[]): Record<WcagFailure, number> {
  const counts: Record<WcagFailure, number> = { F55: 0, F65: 0, F68: 0 };
  for (const barrier of barriers) counts[barrier.failure]++;
  return counts;
}

async function main(): Promise<void> {
  const badPages = JSON.parse(await readFile(path.join(CORPUS_FOLDER, "bad-demo-pages.json"), "utf8")) as CorpusPage[];
  const browser = await launchBrowser();
  const pages: ExpectedBarrierPage[] = [];
  try {
    for (const before of badPages.filter((page) => page.category === "before")) {
      const afterUrl = before.url.replace("/before/", "/after/");
      const context = await createScanContext(browser);
      try {
        const tab = await context.newPage();
        await tab.goto(before.url, { waitUntil: "load" });
        const expected = await findFailures(tab);
        await tab.goto(afterUrl, { waitUntil: "load" });
        const afterCounts = countByFailure(await findFailures(tab));
        pages.push({ url: before.url, afterUrl, expected, afterCounts });
        console.log(`${before.url}: ${expected.length} expected barriers (after page: ${JSON.stringify(afterCounts)})`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  const file: ExpectedBarrierFile = {
    generatedAt: new Date().toISOString(),
    note: "Barriers planted on the W3C BAD 'before' pages that Blindfold's rules cover (WCAG failures F55, F65 in links, F68). Built by npm run corpus:expected-bad.",
    pages,
  };
  await writeFile(path.join(CORPUS_FOLDER, "bad-expected-barriers.json"), `${JSON.stringify(file, null, 2)}\n`);
  console.log("Wrote corpus/bad-expected-barriers.json");
}

try {
  await main();
} catch (error) {
  console.error(`Couldn't build the expected barriers: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
