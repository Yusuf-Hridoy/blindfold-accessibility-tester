// Proves the npm package works for a stranger: build, pack, install the
// tarball into an empty folder, and run the installed `blindfold` command
// against the demo shops. Needs the npm registry (or npm's cache) for the
// package's dependencies.
//
// Set BLINDFOLD_SKIP_PACKAGE_TEST=1 to skip it locally. CI always runs it.

import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDemoSiteServer, type RunningDemoSiteServer } from "../../demo-sites/serve-demo-sites.ts";
import { runCommand, type CliRun } from "../helpers/run-blindfold-cli.ts";

const PROJECT_ROOT = path.join(import.meta.dirname, "..", "..");
const SMOKE_TEST_TIMEOUT_MILLISECONDS = 120_000;
const skipPackageTest = process.env.BLINDFOLD_SKIP_PACKAGE_TEST === "1" && !process.env.CI;

// Vitest hides output from files whose tests are all skipped, so the note is printed by a test.
describe.runIf(skipPackageTest)("the packaged CLI smoke test", () => {
  it("is skipped because BLINDFOLD_SKIP_PACKAGE_TEST=1", () => {
    console.log("Skipped the packaged CLI smoke test (BLINDFOLD_SKIP_PACKAGE_TEST=1). CI always runs it.");
  });
});

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

async function mustSucceed(run: Promise<CliRun>, what: string): Promise<CliRun> {
  const result = await run;
  if (result.exitCode !== 0) throw new Error(`${what} failed (exit code ${result.exitCode}):\n${result.stderr || result.stdout}`);
  return result;
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false,
  );
}

describe.skipIf(skipPackageTest)("the packaged CLI, installed from the tarball", () => {
  let workFolder: string;
  let installFolder: string;
  let buggyServer: RunningDemoSiteServer;
  let accessibleServer: RunningDemoSiteServer;

  beforeAll(async () => {
    workFolder = await mkdtemp(path.join(tmpdir(), "blindfold-package-test-"));
    installFolder = path.join(workFolder, "stranger-project");
    await mustSucceed(runCommand(npm, ["run", "build"], { cwd: PROJECT_ROOT }), "npm run build");
    await mustSucceed(runCommand(npm, ["pack", "--pack-destination", workFolder, "--silent"], { cwd: PROJECT_ROOT }), "npm pack");
    const [tarball] = (await readdir(workFolder)).filter((name) => name.endsWith(".tgz"));
    if (!tarball) throw new Error("npm pack wrote no tarball");

    await runCommand("mkdir", [installFolder]);
    await writeFile(path.join(installFolder, "package.json"), JSON.stringify({ name: "stranger-project", private: true }));
    await mustSucceed(
      runCommand(npm, ["install", path.join(workFolder, tarball), "--prefer-offline", "--no-audit", "--no-fund"], { cwd: installFolder }),
      "npm install of the tarball",
    );
    buggyServer = await startDemoSiteServer({ shop: "buggy", port: 0 });
    accessibleServer = await startDemoSiteServer({ shop: "accessible", port: 0 });
  }, SMOKE_TEST_TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    await buggyServer?.close();
    await accessibleServer?.close();
    if (workFolder) await rm(workFolder, { recursive: true, force: true });
  });

  function runInstalledBlindfold(args: string[]): Promise<CliRun> {
    return runCommand(path.join(installFolder, "node_modules", ".bin", "blindfold"), args, { cwd: installFolder });
  }

  it("installs the blindfold command and reports its version", async () => {
    const run = await runInstalledBlindfold(["--version"]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout.trim()).toBe("0.4.0");
  });

  it(
    "exits 1 for the buggy cart and 0 for the accessible cart, writing both reports each time",
    async () => {
      for (const [server, expectedExitCode] of [
        [buggyServer, 1],
        [accessibleServer, 0],
      ] as const) {
        const output = path.join(installFolder, `results-${server.shop}`);
        const run = await runInstalledBlindfold(["scan", `${server.url}/cart.html?no-cookie-banner=1`, "--output", output]);
        expect(run.exitCode, run.stderr).toBe(expectedExitCode);
        expect(await exists(path.join(output, "report.html"))).toBe(true);
        expect(await exists(path.join(output, "report.json"))).toBe(true);
      }
    },
    SMOKE_TEST_TIMEOUT_MILLISECONDS,
  );
});
