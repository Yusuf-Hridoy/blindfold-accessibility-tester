import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDemoSiteServer, type RunningDemoSiteServer } from "../../demo-sites/serve-demo-sites.ts";

const CLI_PATH = path.join(import.meta.dirname, "..", "..", "src", "cli", "blindfold-cli.ts");

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

describe("blindfold CLI exit codes", () => {
  let buggyServer: RunningDemoSiteServer;
  let accessibleServer: RunningDemoSiteServer;
  let outputRoot: string;

  beforeAll(async () => {
    buggyServer = await startDemoSiteServer({ shop: "buggy", port: 0 });
    accessibleServer = await startDemoSiteServer({ shop: "accessible", port: 0 });
    outputRoot = await mkdtemp(path.join(tmpdir(), "blindfold-cli-test-"));
  });

  afterAll(async () => {
    await buggyServer.close();
    await accessibleServer.close();
    await rm(outputRoot, { recursive: true, force: true });
  });

  it("exits 1 with findings and writes both reports (buggy cart)", async () => {
    const output = path.join(outputRoot, "buggy");
    const run = await runCli(["scan", `${buggyServer.url}/cart.html?no-cookie-banner=1`, "--output", output]);
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toContain("BF-001");
    expect(await fileExists(path.join(output, "report.html"))).toBe(true);
    expect(await fileExists(path.join(output, "report.json"))).toBe(true);
  });

  it("exits 0 with no findings (accessible cart)", async () => {
    const output = path.join(outputRoot, "accessible");
    const run = await runCli(["scan", `${accessibleServer.url}/cart.html?no-cookie-banner=1`, "--output", output]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("No barriers found");
  });

  it("exits 2 with a clear message when nothing is running at the URL", async () => {
    const output = path.join(outputRoot, "refused");
    const run = await runCli(["scan", "http://localhost:1", "--output", output]);
    expect(run.exitCode).toBe(2);
    // Chromium blocks port 1 as unsafe before connecting, so the reason names that.
    expect(run.stderr).toContain("Couldn't load http://localhost:1/ (browsers block this port as unsafe).");
    expect(await fileExists(path.join(output, "report.html"))).toBe(false);
  });

  it("exits 2 with a clear message for an invalid --max-tabs", async () => {
    const run = await runCli(["scan", `${buggyServer.url}/cart.html`, "--max-tabs", "abc"]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("--max-tabs");
    expect(run.stderr).toContain("Use a whole number of 1 or more");
  });
});
