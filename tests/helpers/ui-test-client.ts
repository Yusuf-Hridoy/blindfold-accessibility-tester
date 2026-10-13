// Talks to the web UI server in tests: plain HTTP requests (so the Host header
// can be set), the live progress stream, and the Chromium processes a run leaves.

import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startUiServer, type RunningUiServer } from "../../src/ui/ui-server.ts";
import { isFinalProgressEvent, type ProgressEvent } from "../../src/types/progress-event-types.ts";
import { runCommand } from "./run-blindfold-cli.ts";

export const EXAMPLE_JOURNEYS_FOLDER = path.join(import.meta.dirname, "..", "..", "example-journeys");
const EVENT_TIMEOUT_MILLISECONDS = 90_000;

export interface UiResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface UiRequestOptions {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Sent as-is instead of JSON (for malformed bodies). */
  rawBody?: string;
}

/** One request to 127.0.0.1:<port>. The Host header defaults to 127.0.0.1:<port>. */
export function uiRequest(port: number, options: UiRequestOptions): Promise<UiResponse> {
  const body = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method: options.method ?? "GET",
        path: options.path,
        headers: {
          Host: `127.0.0.1:${port}`,
          ...(body ? { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)) } : {}),
          ...options.headers,
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (text += chunk));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: text }));
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}

export function tokenHeader(token: string): Record<string, string> {
  return { "X-Blindfold-Token": token };
}

/** GET or POST to the API with the right token. */
export function apiCall(server: Pick<RunningUiServer, "port" | "token">, method: string, apiPath: string, body?: unknown): Promise<UiResponse> {
  return uiRequest(server.port, { method, path: apiPath, headers: tokenHeader(server.token), ...(body === undefined ? {} : { body }) });
}

export async function startTestUiServer(journeysFolder: string | null = EXAMPLE_JOURNEYS_FOLDER): Promise<{ server: RunningUiServer; resultsFolder: string }> {
  const resultsFolder = await mkdtemp(path.join(tmpdir(), "blindfold-ui-test-"));
  const server = await startUiServer({ port: 0, resultsFolder, journeysFolder });
  return { server, resultsFolder };
}

/** The live progress stream of one run, collected as it arrives. */
export class RunEventStream {
  readonly events: ProgressEvent[] = [];
  #waiters: { predicate: (event: ProgressEvent) => boolean; resolve: (event: ProgressEvent) => void }[] = [];
  #close: () => void = () => {};

  constructor(port: number, token: string, runId: string) {
    const request = httpRequest({
      host: "127.0.0.1",
      port,
      path: `/api/runs/${encodeURIComponent(runId)}/events?token=${encodeURIComponent(token)}`,
      headers: { Host: `127.0.0.1:${port}` },
    });
    let buffer = "";
    request.on("response", (response) => {
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        buffer += chunk;
        let end: number;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = block.split("\n").find((line) => line.startsWith("data: "));
          if (data) this.#add(JSON.parse(data.slice("data: ".length)) as ProgressEvent);
        }
      });
    });
    request.on("error", () => {});
    request.end();
    this.#close = () => request.destroy();
  }

  #add(event: ProgressEvent): void {
    this.events.push(event);
    this.#waiters = this.#waiters.filter((waiter) => {
      if (!waiter.predicate(event)) return true;
      waiter.resolve(event);
      return false;
    });
  }

  waitFor(predicate: (event: ProgressEvent) => boolean): Promise<ProgressEvent> {
    const existing = this.events.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No matching progress event within ${EVENT_TIMEOUT_MILLISECONDS} ms`)), EVENT_TIMEOUT_MILLISECONDS);
      this.#waiters.push({
        predicate,
        resolve: (event) => {
          clearTimeout(timer);
          resolve(event);
        },
      });
    });
  }

  /** Waits for run-finished, run-failed or run-cancelled, then closes the stream. */
  async waitForEnd(): Promise<ProgressEvent> {
    const event = await this.waitFor(isFinalProgressEvent);
    this.close();
    return event;
  }

  close(): void {
    this.#close();
  }
}

/** Starts a run through the API and returns its id and live progress. */
export async function startRun(
  server: Pick<RunningUiServer, "port" | "token">,
  apiPath: "/api/scans" | "/api/journeys",
  body: Record<string, unknown>,
): Promise<{ runId: string; events: RunEventStream }> {
  const response = await apiCall(server, "POST", apiPath, body);
  if (response.status !== 202) throw new Error(`Starting the run failed (HTTP ${response.status}): ${response.body}`);
  const { runId } = JSON.parse(response.body) as { runId: string };
  return { runId, events: new RunEventStream(server.port, server.token, runId) };
}

/** Chromium processes started by `rootPid` or its children (macOS and Linux). */
export async function chromiumProcessesUnder(rootPid: number): Promise<number[]> {
  const { stdout } = await runCommand("ps", ["-A", "-o", "pid=,ppid=,comm="]);
  const processes = stdout
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ pid: Number(match[1]), parentPid: Number(match[2]), command: match[3] ?? "" }));
  const descendants = new Set([rootPid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const process of processes) {
      if (descendants.has(process.parentPid) && !descendants.has(process.pid)) {
        descendants.add(process.pid);
        grew = true;
      }
    }
  }
  return processes.filter((process) => process.pid !== rootPid && descendants.has(process.pid) && /chrom/i.test(process.command)).map((process) => process.pid);
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Polls until `check` is true, or gives up after `timeoutMilliseconds`. */
export async function eventually(check: () => boolean | Promise<boolean>, timeoutMilliseconds = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return check();
}
