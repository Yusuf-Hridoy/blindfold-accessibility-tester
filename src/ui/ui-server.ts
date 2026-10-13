// The local web UI server (`blindfold ui`): the page, a JSON API, live
// progress over Server-Sent Events, and the files in the results folder.
// Listens on 127.0.0.1 only. See ui-request-security.ts for the checks.

import { access, readFile, readdir, realpath } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { isViewportName, type ViewportName } from "../browser/viewport-presets.ts";
import { resolveFileInsideFolder } from "../files/file-inside-folder.ts";
import { loadJourneyFile, type LoadedJourney } from "../journeys/journey-file-loader.ts";
import { JourneyFileError } from "../journeys/journey-file-schema.ts";
import { JOURNEY_DEFAULTS, runJourneyWithReports, runScanWithReports, SCAN_DEFAULTS } from "../runs/scan-and-journey-runs.ts";
import { parseScanUrl, ScanFailedError } from "../scan/page-scanner.ts";
import { UiRequestError } from "./ui-request-error.ts";
import {
  BASE_SECURITY_HEADERS,
  createSessionToken,
  isAllowedHost,
  isAllowedOrigin,
  readCookie,
  readHeader,
  REPORT_CSP,
  TOKEN_HEADER,
  tokenCookie,
  tokenCookieName,
  tokensMatch,
  UI_PAGE_CSP,
} from "./ui-request-security.ts";
import { compareRuns, readHistory } from "./ui-results-history.ts";
import { UiRunManager } from "./ui-run-manager.ts";

export interface UiServerOptions {
  /** 0 picks a free port; a busy port falls back to a free one. */
  port: number;
  resultsFolder: string;
  /** Null: no journeys offered. */
  journeysFolder: string | null;
}

export interface RunningUiServer {
  port: number;
  token: string;
  /** The page, with the token. */
  url: string;
  /** The requested port was busy, so another one was used. */
  portWasBusy: boolean;
  /** Cancels a running scan (closing its browser) and stops the server. */
  close: () => Promise<void>;
}

interface UiServerContext {
  port: number;
  token: string;
  resultsFolder: string;
  journeysFolder: string | null;
  runs: UiRunManager;
}

const STATIC_FOLDER = path.join(import.meta.dirname, "static");
const PAGE_FILE = "blindfold-ui.html";
const STATIC_FILES: Record<string, { file: string; contentType: string }> = {
  "/blindfold-ui.css": { file: "blindfold-ui.css", contentType: "text/css; charset=utf-8" },
  "/blindfold-ui.js": { file: "blindfold-ui.js", contentType: "text/javascript; charset=utf-8" },
};
const RESULT_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wav": "audio/wav",
};
const MAX_BODY_BYTES = 64 * 1024;
const JOURNEY_FILE_EXTENSION = ".yaml";

function send(response: ServerResponse, status: number, contentType: string, body: string | Buffer, headers: Record<string, string> = {}): void {
  response.writeHead(status, { ...BASE_SECURITY_HEADERS, "Content-Type": contentType, ...headers });
  response.end(body);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  send(response, status, "application/json; charset=utf-8", JSON.stringify(body));
}

function sendText(response: ServerResponse, status: number, text: string): void {
  send(response, status, "text/plain; charset=utf-8", text);
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new UiRequestError(413, "The request is too large.");
    chunks.push(chunk as Buffer);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new UiRequestError(400, "The request isn't valid JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new UiRequestError(400, "The request must be a JSON object.");
  return body as Record<string, unknown>;
}

function readViewport(value: unknown, required: boolean): ViewportName | undefined {
  if (!required && (value === undefined || value === null || value === "")) return undefined;
  if (typeof value === "string" && isViewportName(value)) return value;
  throw new UiRequestError(400, "Choose desktop or mobile.", "viewport");
}

function readAudio(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value === "boolean") return value;
  throw new UiRequestError(400, "audio must be true or false.", "audio");
}

function readScanUrl(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new UiRequestError(400, "Enter a full address starting with http:// or https://, e.g. https://example.com/.", field);
  }
  try {
    return parseScanUrl(value.trim()).href;
  } catch (error) {
    if (error instanceof ScanFailedError) throw new UiRequestError(400, error.message, field);
    throw error;
  }
}

async function listJourneyFiles(journeysFolder: string | null): Promise<string[]> {
  if (!journeysFolder) return [];
  const entries = await readdir(journeysFolder, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(JOURNEY_FILE_EXTENSION))
    .map((entry) => entry.name)
    .sort();
}

/** The journey file must be one of the listed files: a plain name inside the journeys folder. */
async function loadJourneyFromRequest(context: UiServerContext, file: unknown, baseUrlValue: unknown): Promise<LoadedJourney> {
  const chooseFile = "Choose a journey file from the list.";
  if (!context.journeysFolder) throw new UiRequestError(400, "No journeys folder is set. Start the UI with --journeys <folder>.", "file");
  if (typeof file !== "string" || !file.endsWith(JOURNEY_FILE_EXTENSION) || /[/\\]/.test(file)) throw new UiRequestError(400, chooseFile, "file");
  const filePath = resolveFileInsideFolder(context.journeysFolder, `/${file}`);
  if (!filePath || path.dirname(filePath) !== path.resolve(context.journeysFolder)) throw new UiRequestError(400, chooseFile, "file");
  if (!(await listJourneyFiles(context.journeysFolder)).includes(file)) throw new UiRequestError(400, chooseFile, "file");

  const baseUrl = baseUrlValue === undefined || baseUrlValue === null || baseUrlValue === "" ? undefined : readScanUrl(baseUrlValue, "baseUrl");
  try {
    return await loadJourneyFile(filePath, baseUrl);
  } catch (error) {
    if (!(error instanceof JourneyFileError)) throw error;
    if (!baseUrl && error.message.includes("--base-url")) {
      throw new UiRequestError(400, "This journey's start_url is a path, so enter the site's base URL, e.g. http://localhost:4000.", "baseUrl");
    }
    throw new UiRequestError(400, error.message, "file");
  }
}

async function startScan(context: UiServerContext, body: Record<string, unknown>): Promise<string> {
  const url = readScanUrl(body.url, "url");
  const viewport = readViewport(body.viewport ?? "desktop", true) ?? "desktop";
  const audio = readAudio(body.audio);
  return context.runs.start("scan", new URL(url).host, (run) =>
    runScanWithReports({ url, viewport, audio, screenshots: true, closeBrowserOnSignals: false, ...SCAN_DEFAULTS, ...run }),
  );
}

async function startJourney(context: UiServerContext, body: Record<string, unknown>): Promise<string> {
  const journey = await loadJourneyFromRequest(context, body.file, body.baseUrl);
  const viewport = readViewport(body.viewport, false);
  const audio = readAudio(body.audio);
  return context.runs.start("journey", journey.name, (run) =>
    runJourneyWithReports({
      journey,
      audio,
      screenshots: true,
      closeBrowserOnSignals: false,
      ...JOURNEY_DEFAULTS,
      ...(viewport ? { viewport } : {}),
      ...run,
    }),
  );
}

/** Live progress. Reconnecting browsers send Last-Event-ID and get only what they missed. */
function streamRunEvents(context: UiServerContext, request: IncomingMessage, response: ServerResponse, runId: string): void {
  if (!context.runs.hasRun(runId)) {
    sendJson(response, 404, { error: "There's no run with that id." });
    return;
  }
  const lastEventId = Number(readHeader(request, "last-event-id") ?? "-1");
  response.writeHead(200, { ...BASE_SECURITY_HEADERS, "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" });
  response.write(": connected\n\n");
  const unsubscribe = context.runs.subscribe(
    runId,
    (event, index) => response.write(`id: ${index}\ndata: ${JSON.stringify(event)}\n\n`),
    Number.isInteger(lastEventId) ? lastEventId : -1,
  );
  request.on("close", () => unsubscribe?.());
}

async function handleApi(context: UiServerContext, request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  const method = request.method ?? "GET";
  const eventsMatch = /^\/api\/runs\/([^/]+)\/events$/.exec(url.pathname);
  const cancelMatch = /^\/api\/runs\/([^/]+)\/cancel$/.exec(url.pathname);

  // EventSource can't send headers, so only the event stream accepts ?token=.
  const givenToken = readHeader(request, TOKEN_HEADER) ?? (eventsMatch && method === "GET" ? url.searchParams.get("token") : null);
  if (!tokensMatch(context.token, givenToken)) {
    sendJson(response, 403, { error: "Missing or wrong session token. Open the link printed in the terminal." });
    return;
  }
  if (method === "POST" && !isAllowedOrigin(readHeader(request, "origin"), context.port)) {
    sendJson(response, 403, { error: "Requests from other websites aren't allowed." });
    return;
  }

  if (method === "GET" && url.pathname === "/api/history") {
    sendJson(response, 200, { runs: await readHistory(context.resultsFolder), running: context.runs.isRunning() });
  } else if (method === "GET" && url.pathname === "/api/journey-files") {
    const folder = context.journeysFolder ? path.relative(process.cwd(), context.journeysFolder) || "." : null;
    sendJson(response, 200, { folder, files: await listJourneyFiles(context.journeysFolder) });
  } else if (method === "POST" && url.pathname === "/api/scans") {
    sendJson(response, 202, { runId: await startScan(context, await readJsonBody(request)) });
  } else if (method === "POST" && url.pathname === "/api/journeys") {
    sendJson(response, 202, { runId: await startJourney(context, await readJsonBody(request)) });
  } else if (method === "POST" && url.pathname === "/api/compare") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await compareRuns(context.resultsFolder, body.oldRunId, body.newRunId));
  } else if (method === "GET" && eventsMatch?.[1]) {
    streamRunEvents(context, request, response, decodeURIComponent(eventsMatch[1]));
  } else if (method === "POST" && cancelMatch?.[1]) {
    context.runs.cancel(decodeURIComponent(cancelMatch[1]));
    sendJson(response, 202, { cancelling: true });
  } else {
    sendJson(response, 404, { error: "Not found." });
  }
}

async function servePage(context: UiServerContext, response: ServerResponse, url: URL): Promise<void> {
  if (!tokensMatch(context.token, url.searchParams.get("token"))) {
    send(response, 403, "text/html; charset=utf-8", FORBIDDEN_PAGE, { "Content-Security-Policy": UI_PAGE_CSP });
    return;
  }
  const html = await readFile(path.join(STATIC_FOLDER, PAGE_FILE));
  send(response, 200, "text/html; charset=utf-8", html, {
    "Content-Security-Policy": UI_PAGE_CSP,
    "Set-Cookie": tokenCookie(context.port, context.token),
  });
}

const FORBIDDEN_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Blindfold</title></head>
<body><main><h1>Open the link from the terminal</h1>
<p>This page needs the link printed by <code>blindfold ui</code>, which includes a session token.</p></main></body></html>
`;

async function serveResultFile(context: UiServerContext, request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  const givenToken = readCookie(request, tokenCookieName(context.port)) ?? url.searchParams.get("token");
  if (!tokensMatch(context.token, givenToken)) {
    sendText(response, 403, "Missing or wrong session token. Open the link printed in the terminal.");
    return;
  }
  const filePath = resolveFileInsideFolder(context.resultsFolder, url.pathname.slice("/results".length));
  const contentType = filePath ? RESULT_CONTENT_TYPES[path.extname(filePath)] : undefined;
  // realpath: a symbolic link inside the results folder must not lead outside it.
  const realFile = filePath && contentType ? await realpath(filePath).catch(() => null) : null;
  const realFolder = await realpath(context.resultsFolder);
  if (!realFile || !contentType || !realFile.startsWith(realFolder + path.sep)) {
    sendText(response, 404, "Not found");
    return;
  }
  const body = await readFile(realFile).catch(() => null);
  if (!body) {
    sendText(response, 404, "Not found");
    return;
  }
  send(response, 200, contentType, body, contentType.startsWith("text/html") ? { "Content-Security-Policy": REPORT_CSP } : {});
}

async function handleRequest(context: UiServerContext, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!isAllowedHost(readHeader(request, "host"), context.port)) {
    sendText(response, 403, "Forbidden: Blindfold's UI only answers requests for 127.0.0.1 or localhost.");
    return;
  }
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${context.port}`);
  const method = request.method ?? "GET";
  const staticFile = STATIC_FILES[url.pathname];
  if (url.pathname.startsWith("/api/")) {
    await handleApi(context, request, response, url);
  } else if (method === "GET" && url.pathname === "/") {
    await servePage(context, response, url);
  } else if (method === "GET" && staticFile) {
    send(response, 200, staticFile.contentType, await readFile(path.join(STATIC_FOLDER, staticFile.file)));
  } else if (method === "GET" && url.pathname.startsWith("/results/")) {
    await serveResultFile(context, request, response, url);
  } else {
    sendText(response, 404, "Not found");
  }
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      const address = server.address();
      resolve(typeof address === "object" && address !== null ? address.port : port);
    });
  });
}

export async function startUiServer(options: UiServerOptions): Promise<RunningUiServer> {
  const resultsFolder = path.resolve(options.resultsFolder);
  const journeysFolder = options.journeysFolder ? path.resolve(options.journeysFolder) : null;
  await access(STATIC_FOLDER);
  const context: UiServerContext = { port: 0, token: createSessionToken(), resultsFolder, journeysFolder, runs: new UiRunManager(resultsFolder) };

  const server = createServer((request, response) => {
    handleRequest(context, request, response).catch((error: unknown) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      if (error instanceof UiRequestError) {
        sendJson(response, error.status, { error: error.message, ...(error.field ? { field: error.field } : {}) });
        return;
      }
      sendJson(response, 500, { error: `Blindfold's UI hit an unexpected error: ${error instanceof Error ? error.message : String(error)}` });
    });
  });

  let portWasBusy = false;
  try {
    context.port = await listen(server, options.port);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE" || options.port === 0) throw error;
    portWasBusy = true;
    context.port = await listen(server, 0);
  }

  return {
    port: context.port,
    token: context.token,
    url: `http://127.0.0.1:${context.port}/?token=${context.token}`,
    portWasBusy,
    close: async () => {
      await context.runs.shutdown();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
