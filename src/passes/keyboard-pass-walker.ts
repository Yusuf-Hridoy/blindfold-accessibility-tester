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

interface FocusedElement extends PageElementIdentity {
  insideAriaHidden: boolean;
  hasPresentationalRole: boolean;
}

/** The focused element's identity and hiding attributes, or null when focus is on the page body. */
async function identifyFocusedElement(page: Page): Promise<FocusedElement | null> {
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

function toFocusTrap(focusStops: FocusStop[], startIndex: number, cycleLength: number): FocusTrap {
  const cycleStops = focusStops.slice(startIndex, startIndex + cycleLength);
  return {
    startStep: cycleStops[0]?.step ?? 0,
    cycle: cycleStops.map(({ elementId, selector, description }) => ({ elementId, selector, description })),
  };
}

export async function walkWithKeyboard(page: Page, options: KeyboardWalkOptions): Promise<KeyboardWalkResult> {
  const focusStops: FocusStop[] = [];
  let tabPressesOnBody = 0;

  for (let step = 1; step <= options.maxTabs; step++) {
    if (options.useScreenReader) await clearAnnouncements(page);
    await page.keyboard.press("Tab");

    const focused = await identifyFocusedElement(page);
    if (focused === null) {
      if (focusStops.length > 0) return { focusStops, stoppedBecause: "end-of-page", trap: null };
      tabPressesOnBody++;
      if (tabPressesOnBody >= 2) return { focusStops, stoppedBecause: "no-focusable-elements", trap: null };
      continue;
    }
    if (focusStops.length > 0 && focused.elementId === focusStops[0]?.elementId) {
      return { focusStops, stoppedBecause: "cycle-complete", trap: null };
    }

    const roleAndName = await readFocusedRoleAndName(page);
    const announcement = options.useScreenReader
      ? await readAnnouncement(page)
      : formatAsAnnouncement(roleAndName);
    const visibility = await checkFocusVisibility(page);
    const stop: FocusStop = {
      elementId: focused.elementId,
      selector: focused.selector,
      description: focused.description,
      step,
      announcement,
      role: roleAndName.role,
      accessibleName: roleAndName.name,
      hiddenFromScreenReaders: isHiddenFromScreenReaders(focused, roleAndName),
      focusVisible: visibility.focusVisible,
      focusStyleChanges: visibility.focusStyleChanges,
    };
    focusStops.push(stop);
    await options.onFocusStop?.(stop);

    const trap = detectFocusTrap(focusStops.map((focusStop) => focusStop.elementId));
    if (trap) {
      return { focusStops, stoppedBecause: "focus-trap", trap: toFocusTrap(focusStops, trap.startIndex, trap.cycleLength) };
    }
  }
  return { focusStops, stoppedBecause: "max-tabs", trap: null };
}
