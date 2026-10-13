// The web UI's single run: one scan or journey at a time, its progress events
// (kept so a page that connects late, or reconnects, gets all of them), and
// cancelling it. Each run writes to <results>/<YYYY-MM-DD-HHmmss>-<slug>/.

import { existsSync } from "node:fs";
import path from "node:path";
import { isFinalProgressEvent, type ProgressEvent, type ProgressListener, type RunKind } from "../types/progress-event-types.ts";
import { UiRequestError } from "./ui-request-error.ts";

export interface RunContext {
  outputFolder: string;
  onProgress: ProgressListener;
  signal: AbortSignal;
}

/** An event with its position in the run, for SSE ids. */
export type NumberedEventListener = (event: ProgressEvent, index: number) => void;

interface ActiveRun {
  id: string;
  kind: RunKind;
  events: ProgressEvent[];
  listeners: Set<NumberedEventListener>;
  controller: AbortController;
  finished: boolean;
  done: Promise<void>;
}

const MAX_SLUG_LENGTH = 40;

/** e.g. "localhost-4000" or "cart-remove-an-item-and-check-out". */
export function slugFor(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, "");
  return slug || "run";
}

/** Local time, e.g. "2026-10-13-142501". */
export function timestampForFolder(date: Date): string {
  const two = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
}

export class UiRunManager {
  #run: ActiveRun | null = null;

  constructor(private readonly resultsFolder: string) {}

  hasRun(id: string): boolean {
    return this.#run?.id === id;
  }

  isRunning(): boolean {
    return this.#run !== null && !this.#run.finished;
  }

  /** Starts `work` and returns the run id (its results folder name). 409 while another run is going. */
  start(kind: RunKind, subject: string, work: (context: RunContext) => Promise<unknown>): string {
    if (this.isRunning()) {
      throw new UiRequestError(409, "A run is already in progress. Wait for it to finish, or cancel it, before starting another.");
    }
    const id = this.#newRunId(subject);
    const run: ActiveRun = {
      id,
      kind,
      events: [],
      listeners: new Set(),
      controller: new AbortController(),
      finished: false,
      done: Promise.resolve(),
    };
    this.#run = run;
    const onProgress = (event: ProgressEvent): void => this.#emit(run, event);
    run.done = work({ outputFolder: path.join(this.resultsFolder, id), onProgress, signal: run.controller.signal })
      .then(() => {})
      .catch(() => {
        // The run layer has already sent run-failed or run-cancelled.
      })
      .finally(() => {
        if (!run.finished) this.#emit(run, { type: "run-failed", message: "Blindfold stopped unexpectedly." });
      });
    return id;
  }

  /** Replays the events after `afterIndex`, then sends new ones. Null when `id` isn't the current run. */
  subscribe(id: string, listener: NumberedEventListener, afterIndex = -1): (() => void) | null {
    const run = this.#run;
    if (!run || run.id !== id) return null;
    run.events.forEach((event, index) => {
      if (index > afterIndex) listener(event, index);
    });
    run.listeners.add(listener);
    return () => run.listeners.delete(listener);
  }

  cancel(id: string): void {
    const run = this.#run;
    if (!run || run.id !== id) throw new UiRequestError(404, "There's no run with that id.");
    if (run.finished) throw new UiRequestError(409, "This run has already finished.");
    run.controller.abort();
  }

  /** Cancels a running run and waits until its browser is closed. */
  async shutdown(): Promise<void> {
    const run = this.#run;
    if (!run) return;
    if (!run.finished) run.controller.abort();
    await run.done;
  }

  #emit(run: ActiveRun, event: ProgressEvent): void {
    if (run.finished) return;
    const sent = event.type === "run-finished" ? this.#withLinks(run.id, event) : event;
    run.events.push(sent);
    if (isFinalProgressEvent(sent)) run.finished = true;
    const index = run.events.length - 1;
    for (const listener of run.listeners) {
      try {
        listener(sent, index);
      } catch {
        // A closed connection must not stop the run.
      }
    }
  }

  /** The browser gets the run's folder name and links, not an absolute path. */
  #withLinks(id: string, event: Extract<ProgressEvent, { type: "run-finished" }>): ProgressEvent {
    const folderUrl = `/results/${encodeURIComponent(id)}`;
    return {
      ...event,
      reportFolder: id,
      reportUrl: `${folderUrl}/report.html`,
      audioUrl: event.audioFileName ? `${folderUrl}/${encodeURIComponent(event.audioFileName)}` : null,
    };
  }

  #newRunId(subject: string): string {
    const base = `${timestampForFolder(new Date())}-${slugFor(subject)}`;
    let id = base;
    for (let suffix = 2; existsSync(path.join(this.resultsFolder, id)) || id === this.#run?.id; suffix++) id = `${base}-${suffix}`;
    return id;
  }
}
