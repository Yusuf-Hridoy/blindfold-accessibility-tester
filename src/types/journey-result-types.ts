// Shapes of a journey run and the report.json `blindfold run` writes.

import type { JourneyKey } from "../journeys/journey-file-schema.ts";
import type { EffortSummary } from "../metrics/effort-calculator.ts";
import type { AnnouncerEngineName, ElementIdentity, Finding } from "./scan-result-types.ts";

/** A dialog seen after an action, and whether focus ended up inside it. */
export interface ModalObservation extends ElementIdentity {
  accessibleName: string;
  focusInside: boolean;
}

export interface AnnouncementObservation {
  expectedText: string;
  /** The screen reader (Engine A) said something containing the text. */
  announced: boolean;
  /** false in fallback mode: then "announced" can't be known. */
  screenReaderAvailable: boolean;
  /** Where the text visibly appeared after the action, if it did. */
  appearedIn: (ElementIdentity & { inLiveRegion: boolean; focusOnIt: boolean }) | null;
}

/** What happened around one step's action; the input to rules BF-005 to BF-007. */
export interface ActionObservation {
  journeyStep: number;
  /** The key pressed, or null when the step only typed text. */
  key: JourneyKey | null;
  focusBefore: ElementIdentity | null;
  /** null when focus ended on the page body. */
  focusAfter: ElementIdentity | null;
  navigatedToNewPage: boolean;
  newlyVisibleModals: ModalObservation[];
  announcement: AnnouncementObservation | null;
  /** expect_focus_inside naming a visible dialog that focus is not inside. */
  focusOutsideExpectedDialog: ModalObservation | null;
}

export type JourneyStepStatus = "passed" | "passed-with-barriers" | "failed" | "not-run";

export interface ExpectationFailure {
  expectation: string;
  message: string;
}

export interface JourneyStepResult {
  stepNumber: number;
  /** Human summary, e.g. `reach "Add to cart, button" + Enter`. */
  action: string;
  status: JourneyStepStatus;
  keysPressed: string[];
  focusStopsPassed: number;
  /** Everything the screen reader said during the step, live regions included. */
  announcements: string[];
  focusBefore: string | null;
  focusAfter: string | null;
  url: string;
  /** Set when the step's action loaded a new page. */
  navigatedTo?: string;
  expectationFailures: ExpectationFailure[];
  /** For a failed (blocking) step: what stopped the journey. */
  blockedBecause?: string;
  /** For a target that was never reached: the closest things heard instead. */
  closestMatches?: string[];
  durationMilliseconds: number;
}

export interface JourneyTranscriptEntry {
  journeyStep: number;
  /** page: a page loaded · focus: Tab landed on an element · key: an action key · speech: said after an action. */
  kind: "page" | "focus" | "key" | "speech";
  text: string;
  /** For focus entries: what the screen reader said there. */
  spoken?: string;
  url: string;
}

export type JourneyOutcome = "passed" | "completed-with-barriers" | "blocked";

export interface JourneyResult {
  toolVersion: string;
  journeyName: string;
  journeyFile: string;
  startUrl: string;
  finalUrl: string;
  scannedAt: string;
  engine: { name: AnnouncerEngineName; fallbackReason?: string };
  viewport: { width: number; height: number };
  outcome: JourneyOutcome;
  blockedAtStep: number | null;
  /** Findings plus expectation failures. */
  barrierCount: number;
  steps: JourneyStepResult[];
  findings: Finding[];
  effort: EffortSummary;
  transcript: JourneyTranscriptEntry[];
  durationMilliseconds: number;
}
