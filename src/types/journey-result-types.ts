// Shapes of a journey run and the report.json `blindfold run` writes.

import type { ViewportName } from "../browser/viewport-presets.ts";
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

/** Why a step's target was never reached; picks the hint shown under the step. */
export type NeverReachedReason = "full-cycle" | "trap" | "confined" | "max-tabs" | "nothing-focusable";

/** Where focus was legitimately kept when the target was never reached. */
export interface FocusConfinement {
  /** A modal dialog; otherwise a part of the page with everything else inert or aria-hidden. */
  isDialog: boolean;
  /** Its accessible name, or a short description when it has none. */
  name: string;
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
  neverReachedBecause?: NeverReachedReason;
  /** Set when neverReachedBecause is "confined". */
  confinedIn?: FocusConfinement;
  /** The step's action opened a new tab (followed with follow_new_tab, closed otherwise). */
  openedNewTab?: string;
  durationMilliseconds: number;
}

export interface JourneyTranscriptEntry {
  journeyStep: number;
  /**
   * page: a page loaded (or a followed tab) · focus: Tab landed on an element ·
   * key: any other key press · typed: text typed · speech: said after an action ·
   * note: something Blindfold noticed (a frame boundary, a new tab).
   * Every key press is exactly one focus or key entry.
   */
  kind: "page" | "focus" | "key" | "typed" | "speech" | "note";
  text: string;
  /** For focus entries: what the screen reader said there. For key entries: where focus went, when it's worth saying. */
  spoken?: string;
  /** For page entries: how the page was reached, its <title> and lang attribute. */
  openedBy?: "start" | "navigation" | "new-tab";
  title?: string;
  language?: string;
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
  viewport: { width: number; height: number; name: ViewportName };
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
