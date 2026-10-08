// Serves small HTML snippets from a local server so unit tests go through the
// real scanner (init scripts, page load, screen reader) like a real scan.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Browser, Page } from "playwright";
import { createScanContext, launchBrowser } from "../../src/browser/browser-launcher.ts";
import type { JourneyStep } from "../../src/journeys/journey-file-schema.ts";
import { runJourney, type JourneyRunOutcome } from "../../src/journeys/journey-runner.ts";
import { scanPage, type ScanOutcome } from "../../src/scan/page-scanner.ts";

export interface SnippetScanner {
  /** Runs a full scan of the snippet. */
  scan(bodyHtml: string, options?: { maxTabs?: number }): Promise<ScanOutcome>;
  /** Opens the snippet in a scan context (helpers installed) without scanning. */
  open(bodyHtml: string): Promise<Page>;
  /** Serves a snippet and returns its URL (e.g. a second page to navigate to). */
  pageUrl(bodyHtml: string): string;
  /** Runs a journey whose start page is the snippet. Steps need no line numbers. */
  runJourney(bodyHtml: string, steps: Omit<JourneyStep, "line">[]): Promise<JourneyRunOutcome>;
  close(): Promise<void>;
}

function wrapInDocument(bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Snippet</title></head><body>${bodyHtml}</body></html>`;
}

export async function startSnippetScanner(): Promise<SnippetScanner> {
  const snippetsByPath = new Map<string, string>();
  let snippetCount = 0;
  const server = createServer((request, response) => {
    const html = snippetsByPath.get(new URL(request.url ?? "/", "http://localhost").pathname);
    response.writeHead(html ? 200 : 404, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html ?? "Not found");
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const browser: Browser = await launchBrowser();
  const openPages: Page[] = [];

  function addSnippet(bodyHtml: string): string {
    const snippetPath = `/snippet-${++snippetCount}.html`;
    snippetsByPath.set(snippetPath, wrapInDocument(bodyHtml));
    return `http://localhost:${port}${snippetPath}`;
  }

  return {
    scan: (bodyHtml, options) =>
      scanPage({ url: addSnippet(bodyHtml), browser, maxTabs: options?.maxTabs ?? 50, pageTimeoutSeconds: 10, screenshots: false }),
    pageUrl: addSnippet,
    runJourney: (bodyHtml, steps) =>
      runJourney({
        journey: {
          filePath: "snippet-journey.yaml",
          name: "Snippet journey",
          startUrl: addSnippet(bodyHtml),
          steps: steps.map((step, index) => ({ ...step, line: index + 1 })),
        },
        browser,
        maxTabsPerStep: 30,
        pageTimeoutSeconds: 10,
        screenshots: false,
      }),
    open: async (bodyHtml) => {
      const context = await createScanContext(browser);
      const page = await context.newPage();
      openPages.push(page);
      await page.goto(addSnippet(bodyHtml));
      return page;
    },
    close: async () => {
      await Promise.all(openPages.map((page) => page.context().close()));
      await browser.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Selectors of the findings for one rule, for short assertions. */
export function findingSelectors(outcome: ScanOutcome | JourneyRunOutcome, ruleId: string): string[] {
  return outcome.result.findings.filter((finding) => finding.ruleId === ruleId).map((finding) => finding.selector);
}
