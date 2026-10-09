// Serves small HTML snippets from a local server so unit tests go through the
// real scanner (init scripts, page load, screen reader) like a real scan.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Browser, Page } from "playwright";
import { createScanContext, launchBrowser } from "../../src/browser/browser-launcher.ts";
import type { ViewportName } from "../../src/browser/viewport-presets.ts";
import type { JourneyStep } from "../../src/journeys/journey-file-schema.ts";
import { runJourney, type JourneyRunOutcome } from "../../src/journeys/journey-runner.ts";
import { scanPage, type ScanOutcome } from "../../src/scan/page-scanner.ts";
import type { SessionState } from "../../src/sessions/session-file-loader.ts";

export interface SnippetScanOptions {
  maxTabs?: number;
  viewport?: ViewportName;
  session?: SessionState;
}

export interface SnippetScanner {
  /** Runs a full scan of the snippet. */
  scan(bodyHtml: string, options?: SnippetScanOptions): Promise<ScanOutcome>;
  /** Scans a snippet already served (e.g. a protected page). */
  scanUrl(url: string, options?: SnippetScanOptions): Promise<ScanOutcome>;
  /** Opens the snippet in a scan context (helpers installed) without scanning. */
  open(bodyHtml: string): Promise<Page>;
  /** Serves a snippet and returns its URL (e.g. a second page to navigate to, or a same-origin iframe). */
  pageUrl(bodyHtml: string): string;
  /** Serves a snippet from a second origin (127.0.0.1 instead of localhost), e.g. a third-party iframe. */
  otherOriginPageUrl(bodyHtml: string): string;
  /** Serves a snippet that answers 401 unless the request carries this cookie. */
  protectedPageUrl(bodyHtml: string, cookie: { name: string; value: string }): string;
  /** Runs a journey whose start page is the snippet. Steps need no line numbers. */
  runJourney(
    bodyHtml: string,
    steps: Omit<JourneyStep, "line">[],
    options?: { maxTabsPerStep?: number; viewport?: ViewportName },
  ): Promise<JourneyRunOutcome>;
  /** Origin of the main snippet server, e.g. http://localhost:51234 */
  origin: string;
  close(): Promise<void>;
}

function wrapInDocument(bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Snippet</title></head><body>${bodyHtml}</body></html>`;
}

export async function startSnippetScanner(): Promise<SnippetScanner> {
  const snippetsByPath = new Map<string, string>();
  const requiredCookies = new Map<string, string>();
  let snippetCount = 0;
  const handleRequest = (request: IncomingMessage, response: ServerResponse) => {
    const snippetPath = new URL(request.url ?? "/", "http://localhost").pathname;
    const requiredCookie = requiredCookies.get(snippetPath);
    const cookies = (request.headers.cookie ?? "").split(/;\s*/);
    if (requiredCookie && !cookies.includes(requiredCookie)) {
      response.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Log in first");
      return;
    }
    const html = snippetsByPath.get(snippetPath);
    response.writeHead(html ? 200 : 404, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html ?? "Not found");
  };
  const server = createServer(handleRequest);
  // The same snippets from a second origin (127.0.0.1), for third-party iframes.
  const otherOriginServer = createServer(handleRequest);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  await new Promise<void>((resolve) => otherOriginServer.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const otherOriginPort = (otherOriginServer.address() as AddressInfo).port;
  const browser: Browser = await launchBrowser();
  const openPages: Page[] = [];

  function addSnippetPath(bodyHtml: string): string {
    const snippetPath = `/snippet-${++snippetCount}.html`;
    snippetsByPath.set(snippetPath, wrapInDocument(bodyHtml));
    return snippetPath;
  }

  function addSnippet(bodyHtml: string): string {
    return `http://localhost:${port}${addSnippetPath(bodyHtml)}`;
  }

  const scanUrl = (url: string, options?: SnippetScanOptions) =>
    scanPage({
      url,
      browser,
      maxTabs: options?.maxTabs ?? 50,
      pageTimeoutSeconds: 10,
      screenshots: false,
      ...(options?.viewport ? { viewport: options.viewport } : {}),
      ...(options?.session ? { session: options.session } : {}),
    });

  return {
    origin: `http://localhost:${port}`,
    scan: (bodyHtml, options) => scanUrl(addSnippet(bodyHtml), options),
    scanUrl,
    pageUrl: addSnippet,
    otherOriginPageUrl: (bodyHtml) => `http://127.0.0.1:${otherOriginPort}${addSnippetPath(bodyHtml)}`,
    protectedPageUrl: (bodyHtml, cookie) => {
      const snippetPath = addSnippetPath(bodyHtml);
      requiredCookies.set(snippetPath, `${cookie.name}=${cookie.value}`);
      return `http://localhost:${port}${snippetPath}`;
    },
    runJourney: (bodyHtml, steps, options) =>
      runJourney({
        journey: {
          filePath: "snippet-journey.yaml",
          name: "Snippet journey",
          startUrl: addSnippet(bodyHtml),
          steps: steps.map((step, index) => ({ ...step, line: index + 1 })),
        },
        browser,
        maxTabsPerStep: options?.maxTabsPerStep ?? 30,
        pageTimeoutSeconds: 10,
        screenshots: false,
        ...(options?.viewport ? { viewport: options.viewport } : {}),
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
      for (const runningServer of [server, otherOriginServer]) {
        runningServer.closeAllConnections();
        await new Promise<void>((resolve) => runningServer.close(() => resolve()));
      }
    },
  };
}

/** Selectors of the findings for one rule, for short assertions. */
export function findingSelectors(outcome: ScanOutcome | JourneyRunOutcome, ruleId: string): string[] {
  return outcome.result.findings.filter((finding) => finding.ruleId === ruleId).map((finding) => finding.selector);
}
