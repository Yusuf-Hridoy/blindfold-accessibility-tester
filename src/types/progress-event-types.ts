// Live progress of a scan or journey, for the web UI. Sent through the
// optional onProgress callback; never changes a run's result or reports.

import type { ViewportName } from "../browser/viewport-presets.ts";
import type { JourneyOutcome, JourneyStepStatus } from "./journey-result-types.ts";
import type { FindingConfidence, FocusVisibility, RuleId } from "./scan-result-types.ts";

export type RunKind = "scan" | "journey";

/** What a finished run found, in a form the UI can show without reading the report. */
export interface RunSummary {
  kind: RunKind;
  /** The page URL (scan) or the journey name. */
  subject: string;
  barrierCount: number;
  rulesFailed: number;
  focusStops: number;
  /** Journeys only. */
  outcome?: JourneyOutcome;
  /** One line, e.g. "4 barriers found" or "Blocked at step 2". */
  verdict: string;
  /** Doubts about the run itself (scans: most clickable elements never reached). */
  warnings: string[];
  /** Findings per confidence level ("unknown" only for reports written before 0.6.0). */
  confidenceCounts: Record<FindingConfidence | "unknown", number>;
  durationMilliseconds: number;
}

export type ProgressEvent =
  | { type: "run-started"; kind: RunKind; subject: string; viewport: ViewportName }
  | { type: "page-loaded"; url: string }
  | {
      type: "focus-stop";
      step: number;
      element: string;
      announcement: string;
      focusVisible: FocusVisibility;
      /** Journeys only. */
      journeyStep?: number;
    }
  | { type: "step-started"; stepNumber: number; action: string }
  | { type: "step-finished"; stepNumber: number; status: JourneyStepStatus; blockedBecause?: string }
  | { type: "finding"; ruleId: RuleId; element: string; summary: string; confidence?: FindingConfidence; journeyStep?: number }
  | {
      type: "run-finished";
      summary: RunSummary;
      /** Absolute path; the web UI replaces it with the run's folder name. */
      reportFolder: string;
      /** The audio replay's file name in the report folder, when one was written. */
      audioFileName: string | null;
      /** Added by the web UI. */
      reportUrl?: string;
      audioUrl?: string | null;
    }
  | { type: "run-failed"; message: string }
  | { type: "run-cancelled" };

export type ProgressListener = (event: ProgressEvent) => void;

export function isFinalProgressEvent(event: ProgressEvent): boolean {
  return event.type === "run-finished" || event.type === "run-failed" || event.type === "run-cancelled";
}
