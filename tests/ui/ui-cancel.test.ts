// Cancelling from the web UI, and Ctrl+C on `blindfold ui`: the run stops,
// no report folder is written, and no Chromium process is left behind.
// Uses `ps`, so it runs on macOS and Linux only.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDemoSiteServer, type RunningDemoSiteServer } from "../../demo-sites/serve-demo-sites.ts";
import { READY_LINE_PREFIX } from "../../src/ui/ui-command.ts";
import type { RunningUiServer } from "../../src/ui/ui-server.ts";
import { CLI_PATH } from "../helpers/run-blindfold-cli.ts";
import { apiCall, chromiumProcessesUnder, eventually, isProcessAlive, startRun, startTestUiServer } from "../helpers/ui-test-client.ts";

const SCAN_PAGE = "index.html?no-cookie-banner=1";
let demoShop: RunningDemoSiteServer;

beforeAll(async () => {
  demoShop = await startDemoSiteServer({ shop: "buggy", port: 0 });
});

afterAll(async () => {
  await demoShop.close();
});

describe.skipIf(process.platform === "win32")("cancelling a run", () => {
  let server: RunningUiServer;
  let resultsFolder: string;

  beforeAll(async () => {
    ({ server, resultsFolder } = await startTestUiServer());
  });

  afterAll(async () => {
    await server.close();
    await rm(resultsFolder, { recursive: true, force: true });
  });

  it("stops the scan, sends run-cancelled, writes no report folder and leaves no Chromium running", async () => {
    const { runId, events } = await startRun(server, "/api/scans", { url: `${demoShop.url}/${SCAN_PAGE}`, viewport: "desktop", audio: false });
    await events.waitFor((event) => event.type === "focus-stop");
    expect(await chromiumProcessesUnder(process.pid)).not.toEqual([]);

    expect((await apiCall(server, "POST", `/api/runs/${runId}/cancel`)).status).toBe(202);
    const end = await events.waitForEnd();
    expect(end).toEqual({ type: "run-cancelled" });
    expect(events.events.some((event) => event.type === "run-finished" || event.type === "finding")).toBe(false);

    expect(await readdir(resultsFolder)).toEqual([]);
    expect(await eventually(async () => (await chromiumProcessesUnder(process.pid)).length === 0)).toBe(true);
    // A finished run can't be cancelled again.
    expect((await apiCall(server, "POST", `/api/runs/${runId}/cancel`)).status).toBe(409);
  });
});

/** Starts `blindfold ui` from source and resolves once it prints its ready line. */
function startUiProcess(resultsFolder: string): Promise<{ child: ChildProcess; port: number; token: string; output: () => string }> {
  const child = spawn(process.execPath, ["--import", "tsx", CLI_PATH, "ui", "--no-open", "--port", "0", "--results", resultsFolder], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  return new Promise((resolve, reject) => {
    child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const line = output.split("\n").find((candidate) => candidate.startsWith(READY_LINE_PREFIX));
      if (!line) return;
      const ready = JSON.parse(line.slice(READY_LINE_PREFIX.length)) as { port: number; token: string };
      resolve({ child, port: ready.port, token: ready.token, output: () => output });
    });
    child.on("exit", (code) => reject(new Error(`blindfold ui exited early (code ${code}):\n${output}`)));
  });
}

describe.skipIf(process.platform === "win32")("Ctrl+C on blindfold ui", () => {
  it("cancels the running scan, closes its browser and exits 0", async () => {
    const resultsFolder = await mkdtemp(path.join(tmpdir(), "blindfold-ui-sigint-"));
    const ui = await startUiProcess(resultsFolder);
    try {
      const { events } = await startRun(ui, "/api/scans", { url: `${demoShop.url}/${SCAN_PAGE}`, viewport: "desktop", audio: false });
      await events.waitFor((event) => event.type === "focus-stop");
      const browserProcesses = await chromiumProcessesUnder(ui.child.pid ?? -1);
      expect(browserProcesses).not.toEqual([]);

      const exited = new Promise<number | null>((resolve) => ui.child.on("exit", (code) => resolve(code)));
      ui.child.kill("SIGINT");
      expect(await exited).toBe(0);
      expect(ui.output()).toContain("Stopped.");
      expect(await eventually(() => browserProcesses.every((pid) => !isProcessAlive(pid)))).toBe(true);
      expect(await readdir(resultsFolder)).toEqual([]);
      events.close();
    } finally {
      if (ui.child.exitCode === null) ui.child.kill("SIGKILL");
      await rm(resultsFolder, { recursive: true, force: true });
    }
  });
});
