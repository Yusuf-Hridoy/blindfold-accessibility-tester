// Keyboard pass: press Tab repeatedly and record each focus stop, until the
// page wraps around, ends, traps focus, or the Tab limit is reached.

import type { Page } from "playwright";
import {
  formatAsAnnouncement,
  readFocusedRoleAndName,
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

/** The focused element's identity, or null when focus is on the page body. */
async function identifyFocusedElement(page: Page): Promise<PageElementIdentity | null> {
  return page.evaluate(() => {
    const focused = document.activeElement;
    if (!focused || focused === document.body || focused === document.documentElement) return null;
    return window.__blindfoldElements.identify(focused);
  });
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
      ...focused,
      step,
      announcement,
      role: roleAndName.role,
      accessibleName: roleAndName.name,
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
