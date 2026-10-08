// Shapes of the data Blindfold collects and the report.json it writes.

export type RuleId = "BF-001" | "BF-002" | "BF-003" | "BF-004";

/** Why a BF-002 finding fired; each reason has its own title and fix in the catalogue. */
export type Bf002Reason = "missing-name" | "hidden-from-screen-readers";

export type AnnouncerEngineName = "guidepup-virtual-screen-reader" | "accessibility-snapshot-fallback";

export type WalkStopReason =
  | "cycle-complete"
  | "end-of-page"
  | "focus-trap"
  | "max-tabs"
  | "no-focusable-elements";

export type NotTestedReason = "blocked by focus trap" | "scan stopped at max tabs";

/** true / false, or "unknown" when there was no baseline to compare against. */
export type FocusVisibility = boolean | "unknown";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Facts about one element that Blindfold can read from the page. */
export interface ElementIdentity {
  /** Unique per page load; links mouse-pass elements to focus stops. */
  elementId: number;
  selector: string;
  /** Short human description, e.g. `button.cart-button "Checkout"`. */
  description: string;
}

export type InteractiveBecause = "native-element" | "aria-role" | "click-listener" | "pointer-cursor";

export interface MousePassElement extends ElementIdentity {
  tag: string;
  role: string;
  accessibleName: string;
  text: string;
  boundingBox: BoundingBox;
  interactiveBecause: InteractiveBecause;
  /**
   * Hit-test after the keyboard walk, for elements the keyboard never reached:
   * false when no test point lands on the element (clipped or covered), so a
   * mouse can't click it either. Reached elements are "not-checked".
   */
  mouseTarget: boolean | "not-checked";
}

export interface FocusStop extends ElementIdentity {
  /** 1-based Tab press number that produced this stop. */
  step: number;
  /** What the screen reader said (Engine A, or Engine B text in fallback mode). */
  announcement: string;
  /** Structured role and accessible name from Engine B (Playwright ARIA snapshot). */
  role: string;
  accessibleName: string;
  /** aria-hidden (or an honoured role none/presentation) and Chromium exposes nothing. */
  hiddenFromScreenReaders: boolean;
  focusVisible: FocusVisibility;
  /** Which styles changed on focus, e.g. `element.outline-style`, `parent.box-shadow`. */
  focusStyleChanges: string[];
}

export interface FocusTrap {
  /** Step of the first focus stop inside the repeating cycle. */
  startStep: number;
  /** The elements in one turn of the cycle, in order. */
  cycle: ElementIdentity[];
}

export interface TranscriptLine {
  step: number;
  description: string;
  announcement: string;
}

export interface Finding extends ElementIdentity {
  ruleId: RuleId;
  /** Focus-stop step, or null for elements the keyboard never reached. */
  step: number | null;
  /** Up to 2 transcript lines before and after the step. */
  transcriptExcerpt: TranscriptLine[];
  /** BF-002 only: which kind of naming problem it is. */
  reason?: Bf002Reason;
  /** BF-003 only: every element in the trap cycle. */
  trapCycle?: ElementIdentity[];
}

/** A finding as a rule produces it, before the rule engine adds the transcript excerpt. */
export type RuleFinding = Omit<Finding, "transcriptExcerpt">;

export interface NotTestedElement extends ElementIdentity {
  reason: NotTestedReason;
}

/** Everything the passes collected; the input to every rule. */
export interface CollectedScanData {
  mousePassElements: MousePassElement[];
  focusStops: FocusStop[];
  stoppedBecause: WalkStopReason;
  trap: FocusTrap | null;
}

export interface ScanResult {
  toolVersion: string;
  url: string;
  scannedAt: string;
  engine: {
    name: AnnouncerEngineName;
    /** Why Guidepup could not be used, when the fallback engine ran. */
    fallbackReason?: string;
  };
  viewport: { width: number; height: number };
  maxTabs: number;
  stoppedBecause: WalkStopReason;
  focusStops: FocusStop[];
  mousePassElements: MousePassElement[];
  trap: FocusTrap | null;
  findings: Finding[];
  notTested: NotTestedElement[];
  durationMilliseconds: number;
}
