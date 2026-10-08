import { spawn } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDemoSiteServer, type RunningDemoSiteServer } from "../../demo-sites/serve-demo-sites.ts";

const REPO_ROOT = path.join(import.meta.dirname, "..", "..");
const CLI_PATH = path.join(REPO_ROOT, "src", "cli", "blindfold-cli.ts");
const CART_JOURNEY = path.join(REPO_ROOT, "example-journeys", "buggy-shop-cart-journey.yaml");

interface CliRun {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the CLI with Node directly (no shell), the same way `npm run blindfold` does. */
function runCli(args: string[]): Promise<CliRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", CLI_PATH, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false,
  );
}

describe("blindfold run exit codes", () => {
  let buggyServer: RunningDemoSiteServer;
  let accessibleServer: RunningDemoSiteServer;
  let slowServer: Server;
  let slowBaseUrl: string;
  let workFolder: string;

  beforeAll(async () => {
    buggyServer = await startDemoSiteServer({ shop: "buggy", port: 0 });
    accessibleServer = await startDemoSiteServer({ shop: "accessible", port: 0 });
    // Accepts requests but never answers, so only the time limit can end the run.
    slowServer = createServer(() => {});
    await new Promise<void>((resolve) => slowServer.listen(0, resolve));
    slowBaseUrl = `http://localhost:${(slowServer.address() as AddressInfo).port}`;
    workFolder = await mkdtemp(path.join(tmpdir(), "blindfold-run-test-"));
  });

  afterAll(async () => {
    await buggyServer.close();
    await accessibleServer.close();
    slowServer.closeAllConnections();
    await new Promise<void>((resolve) => slowServer.close(() => resolve()));
    await rm(workFolder, { recursive: true, force: true });
  });

  it("exits 1 for the buggy cart journey and writes both reports", async () => {
    const output = path.join(workFolder, "buggy");
    const run = await runCli(["run", CART_JOURNEY, "--base-url", buggyServer.url, "--output", output]);
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toContain("Journey blocked at step 2");
    expect(await fileExists(path.join(output, "report.html"))).toBe(true);
    expect(await fileExists(path.join(output, "report.json"))).toBe(true);
  });

  it("exits 0 for the accessible cart journey", async () => {
    const run = await runCli(["run", CART_JOURNEY, "--base-url", accessibleServer.url, "--output", path.join(workFolder, "accessible")]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("Journey completed ·");
  });

  it("exits 2 for an invalid journey file, naming the file, line and field", async () => {
    const badJourney = path.join(workFolder, "bad-journey.yaml");
    await writeFile(
      badJourney,
      ["name: Typo", "start_url: /cart.html", "steps:", '  - reach: "Checkout, button"', "    press: Enter", '    expect_anouncement: "done"'].join("\n"),
    );
    const run = await runCli(["run", badJourney, "--base-url", buggyServer.url]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain('bad-journey.yaml line 6: step 1 has an unknown field "expect_anouncement"');
  });

  it("exits 2 when the start URL can't be reached", async () => {
    const closedPortServer = createServer();
    await new Promise<void>((resolve) => closedPortServer.listen(0, resolve));
    const closedPort = (closedPortServer.address() as AddressInfo).port;
    await new Promise<void>((resolve) => closedPortServer.close(() => resolve()));

    const run = await runCli(["run", CART_JOURNEY, "--base-url", `http://localhost:${closedPort}`, "--output", path.join(workFolder, "refused")]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("(connection refused). Check the URL is running.");
  });

  it("exits 2 with the time-limit message", async () => {
    const run = await runCli(["run", CART_JOURNEY, "--base-url", slowBaseUrl, "--time-limit", "1", "--output", path.join(workFolder, "slow")]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("Blindfold stopped after 1 s (time limit). Raise --time-limit for very large pages.");
  });
});
