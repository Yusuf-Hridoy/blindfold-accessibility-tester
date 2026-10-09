// Reads a journey file, validates it and resolves start_url.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ViewportName } from "../browser/viewport-presets.ts";
import { JourneyFileError, parseJourneyFile, type JourneyStep } from "./journey-file-schema.ts";

export interface LoadedJourney {
  filePath: string;
  name: string;
  /** Absolute http(s) URL. */
  startUrl: string;
  /** From the file; the --viewport option overrides it. */
  viewport?: ViewportName;
  steps: JourneyStep[];
}

function resolveStartUrl(startUrl: string, baseUrl: string | undefined, fileLabel: string): string {
  if (/^https?:\/\//i.test(startUrl)) return new URL(startUrl).href;
  if (!baseUrl) {
    throw new JourneyFileError(fileLabel, [
      `start_url "${startUrl}" is a path, so Blindfold needs to know the site. Pass --base-url, e.g. --base-url http://localhost:4000.`,
    ]);
  }
  try {
    return new URL(startUrl, baseUrl).href;
  } catch {
    throw new JourneyFileError(fileLabel, [`--base-url "${baseUrl}" is not a valid URL. Use e.g. http://localhost:4000.`]);
  }
}

export async function loadJourneyFile(filePath: string, baseUrl?: string): Promise<LoadedJourney> {
  const fileLabel = path.basename(filePath);
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    throw new JourneyFileError(fileLabel, [`can't be read. Check the path: ${path.resolve(filePath)}`]);
  }
  const content = parseJourneyFile(text, fileLabel);
  return {
    filePath: path.resolve(filePath),
    name: content.name,
    startUrl: resolveStartUrl(content.startUrl, baseUrl, fileLabel),
    ...(content.viewport ? { viewport: content.viewport } : {}),
    steps: content.steps,
  };
}
