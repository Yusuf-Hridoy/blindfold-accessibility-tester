// Keyboard pass: press Tab repeatedly and record each focus stop, until the
// page wraps around, ends, traps focus, or the Tab limit is reached.

import type { Page } from "playwright";
import {
  formatAsAnnouncement,
  readFocusedRoleAndName,
  type RoleAndName,
} from "../announcer/accessibility-snapshot-fallback.ts";
import { clearAnnouncements, readAnnouncement } from "../announcer/screen-reader-announcer.ts";
import { checkFocusVisibility } from "../focus/focus-style-baseline.ts";
import { detectFocusTrap } from "../focus/focus-trap-detector.ts";
import type { PageElementIdentity } from "../browser/page-element-helpers.ts";
import type { FocusStop, FocusTrap, WalkStopReason } from "../types/scan-result-types.ts";

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
}

export interface FocusedElement extends PageElementIdentity {
  insideAriaHidden: boolean;
  hasPresentationalRole: boolean;
}

/** The focused element's identity and hiding attributes, or null when focus is on the page body. */
export async function identifyFocusedElement(page: Page): Promise<FocusedElement | null> {
  return page.evaluate(() => {
    const focused = document.activeElement;
    if (!focused || focused === document.body || focused === document.documentElement) return null;
    const firstRole = (focused.getAttribute("role") ?? "").trim().split(/\s+/)[0];
    return {
      ...window.__blindfoldElements.identify(focused),
      insideAriaHidden: focused.closest('[aria-hidden="true"]') !== null,
      hasPresentationalRole: firstRole === "none" || firstRole === "presentation",
    };
  });
}

/**
 * Hidden only when the browser agrees: Chromium ignores role none/presentation
 * on focusable controls and still announces them, so the attribute alone isn't enough.
 */
function isHiddenFromScreenReaders(focused: FocusedElement, roleAndName: RoleAndName): boolean {
  const exposesNothing = (roleAndName.role === "none" || roleAndName.role === "generic") && roleAndName.name === "";
  return (focused.insideAriaHidden || focused.hasPresentationalRole) && exposesNothing;
}

const FOCUSED_ON_LOAD_PREFIX = "(focused when the page loaded)";

/**
 * Records the stop for the element that has focus now. `announcement` is what
 * the screen reader said; without one (fallback mode, or focus already there),
 * the Engine B role and name are used.
 */
export async function recordFocusStop(
  page: Page,
  focused: FocusedElement,
  step: number,
  announcement: string | null,
): Promise<FocusStop> {
  const roleAndName = await readFocusedRoleAndName(page);
  const visibility = await checkFocusVisibility(page);
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

/** Presses Tab (or another key) once and records where focus lands, or returns null for the page body. */
export async function pressKeyAndRecord(page: Page, step: number, useScreenReader: boolean, key = "Tab"): Promise<FocusStop | null> {
  if (useScreenReader) await clearAnnouncements(page);
  await page.keyboard.press(key);
  const focused = await identifyFocusedElement(page);
  if (focused === null) return null;
  const announcement = useScreenReader ? await readAnnouncement(page) : null;
  return recordFocusStop(page, focused, step, announcement);
}

/** A stop for focus that a page script set before any key was pressed. */
export async function recordFocusOnLoad(page: Page): Promise<FocusStop | null> {
  const focused = await identifyFocusedElement(page);
  if (focused === null) return null;
  const stop = await recordFocusStop(page, focused, 0, null);
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
      if (focusStops.length > 0) return { focusStops, stoppedBecause: "end-of-page", trap: null };
      tabPressesOnBody++;
      if (tabPressesOnBody >= 2) return { focusStops, stoppedBecause: "no-focusable-elements", trap: null };
      continue;
    }
    if (focusStops.length > 0 && stop.elementId === focusStops[0]?.elementId) {
      return { focusStops, stoppedBecause: "cycle-complete", trap: null };
    }
    focusStops.push(stop);
    await options.onFocusStop?.(stop);

    const trap = findTrapInStops(focusStops);
    if (trap) return { focusStops, stoppedBecause: "focus-trap", trap };
  }
  return { focusStops, stoppedBecause: "max-tabs", trap: null };
}
