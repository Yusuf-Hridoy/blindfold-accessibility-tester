// `blindfold ui`: starts the local web UI, prints its link (and a
// machine-readable line for scripts and tests), opens the browser, and on
// Ctrl+C cancels any running scan, closes its browser and stops.

import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { ScanFailedError } from "../scan/page-scanner.ts";
import { TOOL_VERSION } from "../tool-version.ts";
import { openInBrowser } from "./browser-opener.ts";
import { startUiServer } from "./ui-server.ts";

export const DEFAULT_UI_PORT = 4321;
export const DEFAULT_JOURNEYS_FOLDER = "./example-journeys";
/** Followed by JSON: {"url", "port", "token"}. */
export const READY_LINE_PREFIX = "BLINDFOLD_UI_READY";

export interface UiCommandOptions {
  port: number;
  results: string;
  journeys?: string;
  open: boolean;
}

async function isFolder(folder: string): Promise<boolean> {
  return stat(folder).then(
    (stats) => stats.isDirectory(),
    () => false,
  );
}

async function chooseJourneysFolder(option: string | undefined): Promise<string | null> {
  if (option === undefined) return (await isFolder(DEFAULT_JOURNEYS_FOLDER)) ? path.resolve(DEFAULT_JOURNEYS_FOLDER) : null;
  if (!(await isFolder(option))) throw new ScanFailedError(`The journeys folder ${path.resolve(option)} doesn't exist. Check --journeys.`);
  return path.resolve(option);
}

function waitForStopSignal(): Promise<void> {
  return new Promise((resolve) => {
    const stop = (): void => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

export async function startUiCommand(options: UiCommandOptions): Promise<void> {
  const resultsFolder = path.resolve(options.results);
  try {
    await mkdir(resultsFolder, { recursive: true });
  } catch (error) {
    throw new ScanFailedError(`Couldn't create the results folder ${resultsFolder} (${error instanceof Error ? error.message : String(error)}). Check --results.`);
  }
  const journeysFolder = await chooseJourneysFolder(options.journeys);
  const server = await startUiServer({ port: options.port, resultsFolder, journeysFolder });

  console.log(`Blindfold ${TOOL_VERSION} · web UI`);
  if (server.portWasBusy) console.log(`Port ${options.port} is busy, using ${server.port} instead.`);
  console.log(`Blindfold UI running at ${server.url}`);
  console.log(`${READY_LINE_PREFIX} ${JSON.stringify({ url: server.url, port: server.port, token: server.token })}`);
  console.log(`  Results:  ${resultsFolder}`);
  console.log(`  Journeys: ${journeysFolder ?? "none (use --journeys <folder>)"}`);
  console.log("  Only this computer can open it. Press Ctrl+C to stop.");
  if (options.open) openInBrowser(server.url);

  await waitForStopSignal();
  console.log("\nStopping Blindfold UI…");
  await server.close();
  console.log("Stopped.");
}
