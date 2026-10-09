// Keyboard pass: press Tab repeatedly and record each focus stop, until the
// page wraps around, ends, traps focus, or the Tab limit is reached.

import type { Page } from "playwright";
import { formatAsAnnouncement, readRoleAndName, type RoleAndName } from "../announcer/accessibility-snapshot-fallback.ts";
import { clearAnnouncements, readAnnouncement, screenReaderRunsIn } from "../announcer/screen-reader-announcer.ts";
import { checkFocusVisibility } from "../focus/focus-style-baseline.ts";
import { detectFocusTrap } from "../focus/focus-trap-detector.ts";
import { focusedElementLocator, identifyFocusedElement, type FocusedElement } from "../frames/frame-focus-follower.ts";
import type { FocusStop, FocusTrap, WalkStopReason } from "../types/scan-result-types.ts";

export { identifyFocusedElement, type FocusedElement };

export interface KeyboardWalkOptions {
  maxTabs: number;
  /** false in fallback mode: the transcript then comes from the ARIA snapshot. */
  useScreenReader: boolean;
  /** Called right after each stop is recorded, while the element still has focus. */
  onFocusStop?: (stop: FocusStop) => Promise<void>;
}

export interface KeyboardWalkResult {
  focusStops: FocusStop[];
  stoppedBecause: WalkStopReason;
  trap: FocusTrap | null;
  /** Every Tab press, including the last one (onto the page body, or back to the start). */
  tabPresses: number;
}

/**
 * Hidden only when the browser agrees: Chromium ignores role none/presentation
 * on focusable controls and still announces them, so the attribute alone isn't enough.
 */
function isHiddenFromScreenReaders(focused: FocusedElement, roleAndName: RoleAndName): boolean {
  const exposesNothing = (roleAndName.role === "none" || roleAndName.role === "generic") && roleAndName.name === "";
  return (focused.insideAriaHidden || focused.hasPresentationalRole) && exposesNothing;
}

export const FOCUSED_ON_LOAD_PREFIX = "(focused when the page loaded)";

/**
 * Records the stop for the element that has focus now. `announcement` is what
 * the screen reader said; without one (fallback mode, or focus already there),
 * the Engine B role and name are used.
 */
export async function recordFocusStop(
  focused: FocusedElement,
  step: number,
  announcement: string | null,
): Promise<FocusStop> {
  const roleAndName = await readRoleAndName(focusedElementLocator(focused));
  const visibility = await checkFocusVisibility(focused.frame);
  return {
    elementId: focused.elementId,
    selector: focused.selector,
    description: focused.description,
    step,
    announcement: announcement ?? formatAsAnnouncement(roleAndName),
    role: roleAndName.role,
    accessibleName: roleAndName.name,
    hiddenFromScreenReaders: isHiddenFromScreenReaders(focused, roleAndName),
    focusVisible: visibility.focusVisible,
    focusStyleChanges: visibility.focusStyleChanges,
  };
}

/**
 * Focus went into a frame from another origin. Blindfold doesn't test inside,
 * so the stop is a boundary: rules skip it (role and focus visibility unknown).
 */
function frameBoundaryStop(focused: FocusedElement, origin: string, step: number): FocusStop {
  return {
    elementId: focused.elementId,
    selector: focused.selector,
    description: focused.description,
    step,
    announcement: `Focus entered a frame from ${origin}; Blindfold doesn't test third-party content.`,
    role: "unknown",
    accessibleName: "",
    hiddenFromScreenReaders: false,
    focusVisible: "unknown",
    focusStyleChanges: [],
    frameBoundary: { origin, tabPressesInside: 1 },
  };
}

/** The element that has focus now, as a stop (a boundary for a third-party frame). */
async function recordFocusedElement(focused: FocusedElement, step: number, useScreenReader: boolean): Promise<FocusStop> {
  if (focused.thirdPartyOrigin) return frameBoundaryStop(focused, focused.thirdPartyOrigin, step);
  const announcement = useScreenReader && screenReaderRunsIn(focused.frame) ? await readAnnouncement(focused.frame) : null;
  return recordFocusStop(focused, step, announcement);
}

/** Presses Tab (or another key) once and records where focus lands, or returns null for the page body. */
export async function pressKeyAndRecord(page: Page, step: number, useScreenReader: boolean, key = "Tab"): Promise<FocusStop | null> {
  if (useScreenReader) await clearAnnouncements(page);
  await page.keyboard.press(key);
  const focused = await identifyFocusedElement(page);
  return focused === null ? null : recordFocusedElement(focused, step, useScreenReader);
}

/**
 * Another Tab press inside the same third-party frame as the previous stop:
 * counted on that boundary instead of becoming a stop of its own.
 */
export function countPressInsideSameFrame(previous: FocusStop | undefined, stop: FocusStop): boolean {
  if (!stop.frameBoundary || !previous?.frameBoundary || previous.elementId !== stop.elementId) return false;
  previous.frameBoundary.tabPressesInside++;
  return true;
}

/** A stop for focus that a page script set before any key was pressed. */
export async function recordFocusOnLoad(page: Page): Promise<FocusStop | null> {
  const focused = await identifyFocusedElement(page);
  if (focused === null) return null;
  const stop = await recordFocusedElement(focused, 0, false);
  return { ...stop, announcement: `${FOCUSED_ON_LOAD_PREFIX} ${stop.announcement}` };
}

/** The trap among these stops, if the latest ones repeat a cycle (Phase 1 detector). */
export function findTrapInStops(focusStops: FocusStop[]): FocusTrap | null {
  const trap = detectFocusTrap(focusStops.map((focusStop) => focusStop.elementId));
  if (!trap) return null;
  const cycleStops = focusStops.slice(trap.startIndex, trap.startIndex + trap.cycleLength);
  return {
    startStep: cycleStops[0]?.step ?? 0,
    cycle: cycleStops.map(({ elementId, selector, description }) => ({ elementId, selector, description })),
  };
}

/**
 * The candidates that come before the trap's first element in document order.
 * The walk passed their position before it got stuck, so Tab skipped them.
 * Ids must be main-frame ids (frame elements mapped to their iframe).
 */
export async function findElementsBeforeTrap(page: Page, candidateIds: number[], trapElementIds: number[]): Promise<number[]> {
  if (candidateIds.length === 0 || trapElementIds.length === 0) return [];
  return page.evaluate(
    ({ candidates, trapIds }) => {
      const helpers = window.__blindfoldElements;
      const trapElements = trapIds.map((id) => helpers.elementForId(id)).filter((element) => element !== undefined);
      const firstTrapElement = trapElements.reduce<Element | undefined>(
        (earliest, element) => (!earliest || element.compareDocumentPosition(earliest) & Node.DOCUMENT_POSITION_FOLLOWING ? element : earliest),
        undefined,
      );
      if (!firstTrapElement) return [];
      return candidates.filter((id) => {
        const element = helpers.elementForId(id);
        return !!element && !!(element.compareDocumentPosition(firstTrapElement) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
    },
    { candidates: candidateIds, trapIds: trapElementIds },
  );
}

export async function walkWithKeyboard(page: Page, options: KeyboardWalkOptions): Promise<KeyboardWalkResult> {
  const focusStops: FocusStop[] = [];
  let tabPressesOnBody = 0;

  // A page script may already have focused something (e.g. a cookie banner's
  // button). The keyboard user starts there, so it counts as reached.
  const focusedOnLoad = await recordFocusOnLoad(page);
  if (focusedOnLoad) {
    focusStops.push(focusedOnLoad);
    await options.onFocusStop?.(focusedOnLoad);
  }

  for (let step = 1; step <= options.maxTabs; step++) {
    const stop = await pressKeyAndRecord(page, step, options.useScreenReader);
    if (stop === null) {
      if (focusStops.length > 0) return { focusStops, stoppedBecause: "end-of-page", trap: null, tabPresses: step };
      tabPressesOnBody++;
      if (tabPressesOnBody >= 2) return { focusStops, stoppedBecause: "no-focusable-elements", trap: null, tabPresses: step };
      continue;
    }
    if (countPressInsideSameFrame(focusStops.at(-1), stop)) continue;
    if (focusStops.length > 0 && stop.elementId === focusStops[0]?.elementId) {
      return { focusStops, stoppedBecause: "cycle-complete", trap: null, tabPresses: step };
    }
    focusStops.push(stop);
    await options.onFocusStop?.(stop);

    const trap = findTrapInStops(focusStops);
    if (trap) return { focusStops, stoppedBecause: "focus-trap", trap, tabPresses: step };
  }
  return { focusStops, stoppedBecause: "max-tabs", trap: null, tabPresses: options.maxTabs };
}
