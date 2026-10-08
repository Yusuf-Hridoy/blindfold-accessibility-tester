// Runs a journey step by step with only a keyboard, listening to the screen
// reader, across page navigations. Only a failed reach/dismiss blocks the
// journey; failed expectations are recorded and the journey carries on.

import type { Browser, Page } from "playwright";
import { readRoleAndName } from "../announcer/accessibility-snapshot-fallback.ts";
import {
  clearAnnouncements,
  readAllAnnouncements,
  startScreenReaderAnnouncer,
  type AnnouncerStatus,
} from "../announcer/screen-reader-announcer.ts";
import { createScanContext, DESKTOP_VIEWPORT } from "../browser/browser-launcher.ts";
import { recordFocusStyleBaselines } from "../focus/focus-style-baseline.ts";
import { calculateEffort } from "../metrics/effort-calculator.ts";
import { detectOverlays } from "../overlays/blocking-overlay-detector.ts";
import { checkMouseTargets, collectMousePassElements } from "../passes/mouse-pass-collector.ts";
import {
  findTrapInStops,
  identifyFocusedElement,
  pressKeyAndRecord,
  recordFocusStop,
} from "../passes/keyboard-pass-walker.ts";
import { findUnnamedControls } from "../rules/bf002-unnamed-control.ts";
import { findFocusTraps } from "../rules/bf003-focus-trap.ts";
import { findInvisibleFocus } from "../rules/bf004-invisible-focus.ts";
import { findSilentUpdates } from "../rules/bf005-silent-update.ts";
import { findFocusLostAfterAction } from "../rules/bf006-focus-lost-after-action.ts";
import { findModalsWithoutFocus } from "../rules/bf007-modal-without-focus.ts";
import { findOverlaysBlockingKeyboard } from "../rules/bf008-overlay-blocks-keyboard.ts";
import { dropFindingsCoveredByOverlays } from "../rules/rule-engine.ts";
import { captureElementScreenshot, describeError, loadPage, ScanFailedError, selectorContainingAll } from "../scan/page-scanner.ts";
import { TOOL_VERSION } from "../tool-version.ts";
import type {
  ActionObservation,
  ExpectationFailure,
  JourneyResult,
  JourneyStepResult,
  JourneyTranscriptEntry,
  ModalObservation,
} from "../types/journey-result-types.ts";
import type { ElementIdentity, Finding, FocusStop, FocusTrap, RuleFinding } from "../types/scan-result-types.ts";
import type { LoadedJourney } from "./journey-file-loader.ts";
import type { JourneyKey, JourneyStep } from "./journey-file-schema.ts";
import { closestMatches, matchesTarget, normalizeText, targetName } from "./focus-target-matcher.ts";
import {
  checkCycleConfinement,
  findAppearedText,
  installPageChangeWatcher,
  listFocusContainers,
  listVisibleClosables,
  listVisibleModals,
  resetPageChanges,
  trackNavigation,
  waitForPageToSettle,
  type NavigationTracker,
} from "./page-change-watcher.ts";

export interface JourneyRunOptions {
  journey: LoadedJourney;
  browser: Browser;
  maxTabsPerStep: number;
  pageTimeoutSeconds: number;
  screenshots: boolean;
}

export interface JourneyRunOutcome {
  result: JourneyResult;
  screenshots: Map<Finding, string>;
}

const ANNOUNCEMENT_WINDOW_MILLISECONDS = 1_500;
const NETWORK_SETTLE_CAP_MILLISECONDS = 2_000;
const TRANSCRIPT_EXCERPT_LENGTH = 5;

/** State shared by all steps of one run. */
interface JourneySession {
  page: Page;
  options: JourneyRunOptions;
  navigation: NavigationTracker;
  documentMarker: string;
  pageLoadNumber: number;
  firstAnnouncer: AnnouncerStatus | null;
  useScreenReader: boolean;
  findings: Finding[];
  screenshots: Map<Finding, string>;
  /** `${ruleId} ${selector}` for BF-002/BF-004 (once per journey), `${pageLoad} ${selector}` for BF-008. */
  reportedKeys: Set<string>;
  /** Every element that had keyboard focus on the current page load; never a BF-001 candidate. */
  reachedOnThisPage: Set<number>;
  transcript: JourneyTranscriptEntry[];
}

interface StepProgress {
  stepNumber: number;
  keysPressed: string[];
  focusStops: FocusStop[];
  announcements: string[];
  expectationFailures: ExpectationFailure[];
}

/** After a page loads: watch DOM changes, record focus baselines, start the screen reader. */
async function preparePage(session: JourneySession, stepNumber: number): Promise<void> {
  const { page } = session;
  await page.waitForLoadState("networkidle", { timeout: NETWORK_SETTLE_CAP_MILLISECONDS }).catch(() => {});
  session.documentMarker = await installPageChangeWatcher(page);
  await recordFocusStyleBaselines(page);
  const announcer = await startScreenReaderAnnouncer(page);
  session.firstAnnouncer ??= announcer;
  session.useScreenReader = announcer.engine === "guidepup-virtual-screen-reader";
  session.pageLoadNumber++;
  // Element ids restart with each document.
  session.reachedOnThisPage.clear();
  session.transcript.push({ journeyStep: stepNumber, kind: "page", text: page.url(), url: page.url() });
}

function addTranscript(session: JourneySession, step: number, entry: Omit<JourneyTranscriptEntry, "journeyStep" | "url">): void {
  session.transcript.push({ ...entry, journeyStep: step, url: session.page.url() });
}

/** Adds findings to the journey, capturing each screenshot while the page still shows the problem. */
async function addFindings(session: JourneySession, stepNumber: number, ruleFindings: RuleFinding[], focusScreenshot?: string): Promise<void> {
  for (const ruleFinding of dropFindingsCoveredByOverlays(ruleFindings)) {
    const stepLines = session.transcript.filter((entry) => entry.journeyStep === stepNumber && entry.kind !== "page");
    const finding: Finding = {
      ...ruleFinding,
      journeyStep: stepNumber,
      transcriptExcerpt: stepLines.slice(-TRANSCRIPT_EXCERPT_LENGTH).map((entry) => ({
        step: stepNumber,
        description: entry.kind === "focus" ? entry.text : entry.kind === "key" ? `pressed ${entry.text}` : "",
        announcement: entry.kind === "focus" ? (entry.spoken ?? "") : entry.kind === "speech" ? entry.text : "",
      })),
    };
    session.findings.push(finding);
    if (!session.options.screenshots) continue;
    const image = focusScreenshot ?? (await screenshotForFinding(session.page, finding));
    if (image) session.screenshots.set(finding, image);
  }
}

async function screenshotForFinding(page: Page, finding: Finding): Promise<string | null> {
  if (finding.ruleId === "BF-006") return null; // the element is gone
  if (finding.ruleId === "BF-003" && finding.trapCycle) {
    const container = await selectorContainingAll(page, finding.trapCycle.map((element) => element.elementId));
    return container ? captureElementScreenshot(page, page.locator(container).first(), true) : null;
  }
  return captureElementScreenshot(page, page.locator(finding.selector).first(), true);
}

/** BF-002 and BF-004 for focus stops passed, each element once per journey. */
async function checkPassedStop(session: JourneySession, progress: StepProgress, stop: FocusStop): Promise<void> {
  const data = { focusStops: [stop], mousePassElements: [], stoppedBecause: "end-of-page" as const, trap: null, blockingOverlays: [] };
  const fresh = [...findUnnamedControls(data), ...findInvisibleFocus(data)].filter((finding) => {
    const key = `${finding.ruleId} ${finding.selector}`;
    if (session.reportedKeys.has(key)) return false;
    session.reportedKeys.add(key);
    return true;
  });
  if (fresh.length === 0) return;
  const image = session.options.screenshots
    ? ((await captureElementScreenshot(session.page, session.page.locator(":focus").first(), false)) ?? undefined)
    : undefined;
  await addFindings(session, progress.stepNumber, fresh, image);
}

/** BF-008 at the current moment; each overlay once per page load. */
async function checkOverlays(session: JourneySession, stepNumber: number, mouseTargetIds?: number[]): Promise<boolean> {
  const ids = mouseTargetIds ?? (await collectMousePassElements(session.page, { withAccessibleNames: false })).map((element) => element.elementId);
  const blockingOverlays = await detectOverlays(session.page, ids);
  const findings = findOverlaysBlockingKeyboard({ blockingOverlays, focusStops: [] });
  const fresh = findings.filter((finding) => {
    const key = `BF-008 ${session.pageLoadNumber} ${finding.selector}`;
    if (session.reportedKeys.has(key)) return false;
    session.reportedKeys.add(key);
    return true;
  });
  await addFindings(session, stepNumber, fresh);
  return findings.length > 0;
}

type ReachOutcome =
  | { reached: true }
  | { reached: false; reason: string; trapFinding: RuleFinding | null; focusConfined: boolean };

/** A trap's cycle, rotated to start at its earliest element in page order (as `scan` anchors it). */
async function trapStartingInPageOrder(page: Page, cycleStops: FocusStop[]): Promise<FocusTrap> {
  const { firstInPageOrder } = await checkCycleConfinement(page, cycleStops.map((stop) => stop.elementId));
  const rotated = [...cycleStops.slice(firstInPageOrder), ...cycleStops.slice(0, firstInPageOrder)];
  return {
    startStep: rotated[0]?.step ?? 0,
    cycle: rotated.map(({ elementId, selector, description }) => ({ elementId, selector, description })),
  };
}

function trapFindingFor(trap: FocusTrap): RuleFinding | null {
  const [finding] = findFocusTraps({ focusStops: [], mousePassElements: [], stoppedBecause: "focus-trap", trap, blockingOverlays: [] });
  return finding ?? null;
}

/** Tabs until the focused element matches the target, a cycle completes, focus is trapped, or the limit is hit. */
async function reachTarget(session: JourneySession, progress: StepProgress, target: string): Promise<ReachOutcome> {
  const { page } = session;
  const current = await identifyFocusedElement(page);
  if (current) {
    session.reachedOnThisPage.add(current.elementId);
    const { role, name } = await readRoleAndName(page.locator(":focus").first());
    if (matchesTarget(target, { role, name, announcement: "" })) return { reached: true };
  }

  const stops: FocusStop[] = [];
  let bodyPressesInARow = 0;
  let passedEndOfPage = false;
  for (let press = 1; press <= session.options.maxTabsPerStep; press++) {
    progress.keysPressed.push("Tab");
    const stop = await pressKeyAndRecord(page, progress.focusStops.length + 1, session.useScreenReader);
    if (stop === null) {
      passedEndOfPage = true;
      if (++bodyPressesInARow >= 2) {
        return { reached: false, reason: "nothing on the page can be reached with Tab", trapFinding: null, focusConfined: false };
      }
      continue;
    }
    bodyPressesInARow = 0;
    if (stops.length > 0 && stop.elementId === stops[0]?.elementId) {
      // Back at the step's first stop. Only a full cycle if focus passed the end of the page.
      if (passedEndOfPage) {
        return { reached: false, reason: "a full Tab cycle went by without reaching it", trapFinding: null, focusConfined: false };
      }
      const { confined } = await checkCycleConfinement(page, stops.map((cycleStop) => cycleStop.elementId));
      if (confined) {
        return { reached: false, reason: "focus is kept inside a modal dialog, and it isn't in there", trapFinding: null, focusConfined: true };
      }
      return {
        reached: false,
        reason: "keyboard focus got trapped",
        trapFinding: trapFindingFor(await trapStartingInPageOrder(page, stops)),
        focusConfined: false,
      };
    }
    stops.push(stop);
    session.reachedOnThisPage.add(stop.elementId);
    progress.focusStops.push(stop);
    progress.announcements.push(stop.announcement);
    addTranscript(session, progress.stepNumber, { kind: "focus", text: stop.description, spoken: stop.announcement });
    await checkPassedStop(session, progress, stop);

    if (matchesTarget(target, { role: stop.role, name: stop.accessibleName, announcement: stop.announcement })) {
      return { reached: true };
    }
    const trap = findTrapInStops(stops);
    if (trap) {
      const cycleStops = stops.filter((cycleStop) => trap.cycle.some((element) => element.elementId === cycleStop.elementId));
      const uniqueCycleStops = cycleStops.filter((cycleStop, index) => cycleStops.findIndex((other) => other.elementId === cycleStop.elementId) === index);
      return {
        reached: false,
        reason: "keyboard focus got trapped",
        trapFinding: trapFindingFor(await trapStartingInPageOrder(page, uniqueCycleStops)),
        focusConfined: false,
      };
    }
  }
  return {
    reached: false,
    reason: `not reached within ${session.options.maxTabsPerStep} Tab presses (--max-tabs-per-step)`,
    trapFinding: null,
    focusConfined: false,
  };
}

/**
 * After a target was never reached: BF-003 for a trap, otherwise BF-008 for a
 * blocking overlay and BF-001 for a matching mouse-only control. No BF-001
 * when a modal legitimately confines focus: outside it is unreachable on purpose.
 */
async function explainNeverReached(
  session: JourneySession,
  progress: StepProgress,
  target: string,
  trapFinding: RuleFinding | null,
  focusConfined: boolean,
): Promise<void> {
  if (trapFinding) {
    await addFindings(session, progress.stepNumber, [{ ...trapFinding, message: `focus trapped in ${trapFinding.description}` }]);
    return;
  }
  const { page } = session;
  // Anything the keyboard reached on this page load is reachable, whatever this step's walk saw.
  const reachedIds = new Set([...session.reachedOnThisPage, ...progress.focusStops.map((stop) => stop.elementId)]);
  const mouseElements = await checkMouseTargets(page, await collectMousePassElements(page), reachedIds);
  const mouseTargets = mouseElements.filter((element) => element.mouseTarget !== false);
  const overlayFound = await checkOverlays(session, progress.stepNumber, mouseTargets.map((element) => element.elementId));

  const wantedName = normalizeText(targetName(target));
  const unreachableMatches: RuleFinding[] = mouseTargets
    .filter(
      (element) =>
        !reachedIds.has(element.elementId) &&
        (normalizeText(element.accessibleName) === wantedName || normalizeText(element.text) === wantedName),
    )
    .map(({ elementId, selector, description }) => ({
      ruleId: "BF-001",
      elementId,
      selector,
      description,
      step: null,
      message: `"${target}" exists for the mouse but can't be reached by keyboard`,
    }));
  // Controls inside a blocking overlay were already reported under BF-008.
  const overlayControlIds = new Set(
    session.findings.filter((finding) => finding.ruleId === "BF-008").flatMap((finding) => finding.overlayControls?.map((control) => control.elementId) ?? []),
  );
  if (focusConfined) return;
  const bf001 = overlayFound ? unreachableMatches.filter((finding) => !overlayControlIds.has(finding.elementId)) : unreachableMatches;
  await addFindings(session, progress.stepNumber, bf001);
}

function playwrightKeyName(key: JourneyKey): string {
  return key === "Space" ? " " : key;
}

async function modalsWithNames(page: Page, dialogs: { elementId: number; selector: string; description: string; focusInside: boolean }[]): Promise<ModalObservation[]> {
  const named: ModalObservation[] = [];
  for (const dialog of dialogs) {
    const { name } = await readRoleAndName(page.locator(dialog.selector).first());
    named.push({ ...dialog, accessibleName: name });
  }
  return named;
}

/** Waits up to 1.5 s after the action for the screen reader to say the expected text. */
async function waitForAnnouncement(session: JourneySession, expected: string, actionStartedAt: number): Promise<string[]> {
  const wanted = normalizeText(expected);
  for (;;) {
    const spoken = await readAllAnnouncements(session.page);
    if (spoken.some((phrase) => normalizeText(phrase).includes(wanted))) return spoken;
    if (Date.now() - actionStartedAt >= ANNOUNCEMENT_WINDOW_MILLISECONDS) return spoken;
    await session.page.waitForTimeout(50);
  }
}

/** Performs the step's typing and key press, waits for the page to settle, and observes what changed. */
async function performAction(session: JourneySession, progress: StepProgress, step: JourneyStep, key: JourneyKey | null): Promise<ActionObservation> {
  const { page } = session;
  if (step.type) {
    await page.keyboard.type(step.type);
    addTranscript(session, progress.stepNumber, { kind: "key", text: `typed "${step.type}"` });
  }

  const focusBeforeElement = await identifyFocusedElement(page);
  if (focusBeforeElement) session.reachedOnThisPage.add(focusBeforeElement.elementId);
  const focusBefore: ElementIdentity | null = focusBeforeElement
    ? { elementId: focusBeforeElement.elementId, selector: focusBeforeElement.selector, description: focusBeforeElement.description }
    : null;
  const modalIdsBefore = new Set((await listVisibleModals(page)).map((dialog) => dialog.elementId));
  await resetPageChanges(page);
  if (session.useScreenReader) await clearAnnouncements(page);
  session.navigation.reset();

  const actionStartedAt = Date.now();
  if (key) {
    progress.keysPressed.push(key);
    addTranscript(session, progress.stepNumber, { kind: "key", text: key });
    await page.keyboard.press(playwrightKeyName(key));
  }
  const { newDocument } = await waitForPageToSettle(page, session.documentMarker, session.navigation, session.options.pageTimeoutSeconds);

  if (newDocument) {
    const status = session.navigation.responseStatus();
    if (status !== null && (status < 200 || status > 299)) {
      throw new ScanFailedError(`Step ${progress.stepNumber} opened ${page.url()}, which returned HTTP ${status}. Blindfold only continues on pages that load successfully (2xx).`);
    }
    await preparePage(session, progress.stepNumber);
    return {
      journeyStep: progress.stepNumber,
      key,
      focusBefore,
      focusAfter: null,
      navigatedToNewPage: true,
      newlyVisibleModals: [],
      announcement: step.expectAnnouncement
        ? { expectedText: step.expectAnnouncement, announced: false, screenReaderAvailable: session.useScreenReader, appearedIn: null }
        : null,
      focusOutsideExpectedDialog: null,
    };
  }

  const spoken =
    session.useScreenReader && step.expectAnnouncement
      ? await waitForAnnouncement(session, step.expectAnnouncement, actionStartedAt)
      : session.useScreenReader
        ? await readAllAnnouncements(page)
        : [];
  for (const phrase of spoken) {
    progress.announcements.push(phrase);
    addTranscript(session, progress.stepNumber, { kind: "speech", text: phrase });
  }

  const focusAfterElement = await identifyFocusedElement(page);
  if (focusAfterElement) session.reachedOnThisPage.add(focusAfterElement.elementId);
  if (focusAfterElement && (key === "Tab" || key === "Shift+Tab")) {
    const stop = await recordFocusStop(page, focusAfterElement, progress.focusStops.length + 1, spoken.join(" | ") || null);
    progress.focusStops.push(stop);
    await checkPassedStop(session, progress, stop);
  }

  const visibleModals = await modalsWithNames(page, await listVisibleModals(page));
  const newlyVisibleModals = visibleModals.filter((dialog) => !modalIdsBefore.has(dialog.elementId));
  let focusOutsideExpectedDialog: ModalObservation | null = null;
  if (step.expectFocusInside && !(await isFocusInsideNamed(page, step.expectFocusInside))) {
    const wanted = normalizeText(step.expectFocusInside);
    focusOutsideExpectedDialog = visibleModals.find((dialog) => normalizeText(dialog.accessibleName).includes(wanted)) ?? null;
  }

  return {
    journeyStep: progress.stepNumber,
    key,
    focusBefore,
    focusAfter: focusAfterElement
      ? { elementId: focusAfterElement.elementId, selector: focusAfterElement.selector, description: focusAfterElement.description }
      : null,
    navigatedToNewPage: false,
    newlyVisibleModals,
    announcement: step.expectAnnouncement
      ? {
          expectedText: step.expectAnnouncement,
          announced: spoken.some((phrase) => normalizeText(phrase).includes(normalizeText(step.expectAnnouncement ?? ""))),
          screenReaderAvailable: session.useScreenReader,
          appearedIn: await findAppearedText(page, step.expectAnnouncement),
        }
      : null,
    focusOutsideExpectedDialog,
  };
}

/** Focus is inside an element (dialog, region, form…) whose accessible name contains `name`. */
async function isFocusInsideNamed(page: Page, name: string): Promise<boolean> {
  const wanted = normalizeText(name);
  for (const container of await listFocusContainers(page)) {
    const { name: containerName } = await readRoleAndName(page.locator(container.selector).first());
    if (normalizeText(containerName).includes(wanted)) return true;
  }
  return false;
}

/** Expectations not already explained by a rule finding (BF-005, BF-007). */
async function checkExpectations(session: JourneySession, progress: StepProgress, step: JourneyStep, observation: ActionObservation | null): Promise<void> {
  const { page } = session;
  const fail = (expectation: string, message: string) => progress.expectationFailures.push({ expectation, message });

  if (step.expectAnnouncement) {
    const check = observation?.announcement;
    const heard = progress.announcements.some((phrase) => normalizeText(phrase).includes(normalizeText(step.expectAnnouncement ?? "")));
    if (check ? !check.announced && !check.appearedIn : !heard) {
      fail("expect_announcement", `expected message never appeared: "${step.expectAnnouncement}"`);
    }
  }
  if (step.expectFocusInside && !observation?.focusOutsideExpectedDialog && !(await isFocusInsideNamed(page, step.expectFocusInside))) {
    const focused = await identifyFocusedElement(page);
    fail("expect_focus_inside", `expected focus inside "${step.expectFocusInside}", but focus is on ${focused?.description ?? "the page body"}`);
  }
  if (step.expectFocusOn) {
    const focused = await identifyFocusedElement(page);
    const { role, name } = focused ? await readRoleAndName(page.locator(":focus").first()) : { role: "", name: "" };
    const lastFocusAnnouncement = progress.focusStops.at(-1)?.announcement ?? "";
    if (!focused || !matchesTarget(step.expectFocusOn, { role, name, announcement: lastFocusAnnouncement })) {
      fail("expect_focus_on", `expected focus on "${step.expectFocusOn}", but focus is on ${focused?.description ?? "the page body"}`);
    }
  }
  if (step.expectClosed) {
    const wanted = normalizeText(step.expectClosed);
    const stillOpen = (await modalsWithNames(page, await listVisibleClosables(page))).find((element) =>
      normalizeText(element.accessibleName).includes(wanted),
    );
    if (stillOpen) fail("expect_closed", `expected "${step.expectClosed}" to be closed, but it is still open`);
  }
  if (step.expectUrlContains && !page.url().includes(step.expectUrlContains)) {
    fail("expect_url_contains", `expected the URL to contain "${step.expectUrlContains}", but it is ${page.url()}`);
  }
}

function describeAction(step: JourneyStep): string {
  const parts: string[] = [];
  if (step.dismiss) parts.push(`dismiss "${step.dismiss}"`);
  if (step.reach) parts.push(`reach "${step.reach}"`);
  if (step.type) parts.push(step.reach ? `+ type "${step.type}"` : `type "${step.type}"`);
  if (step.press) parts.push(step.reach || step.type ? `+ ${step.press}` : `press ${step.press}`);
  return parts.join(" ");
}

async function runStep(session: JourneySession, step: JourneyStep, stepNumber: number): Promise<JourneyStepResult> {
  const { page } = session;
  const startedAt = Date.now();
  const progress: StepProgress = {
    stepNumber,
    keysPressed: [],
    focusStops: [],
    announcements: [],
    expectationFailures: [],
  };
  const focusBefore = (await identifyFocusedElement(page))?.description ?? null;
  const urlBefore = page.url();
  const finish = async (fields: Partial<JourneyStepResult>): Promise<JourneyStepResult> => {
    const hasBarriers = progress.expectationFailures.length > 0 || session.findings.some((finding) => finding.journeyStep === stepNumber);
    return {
      stepNumber,
      action: describeAction(step),
      status: fields.blockedBecause ? "failed" : hasBarriers ? "passed-with-barriers" : "passed",
      keysPressed: progress.keysPressed,
      focusStopsPassed: progress.focusStops.length,
      announcements: progress.announcements,
      focusBefore,
      focusAfter: (await identifyFocusedElement(page).catch(() => null))?.description ?? null,
      url: page.url(),
      ...(page.url() !== urlBefore ? { navigatedTo: page.url() } : {}),
      expectationFailures: progress.expectationFailures,
      durationMilliseconds: Date.now() - startedAt,
      ...fields,
    };
  };

  const target = step.dismiss ?? step.reach;
  if (target) {
    const reach = await reachTarget(session, progress, target);
    if (!reach.reached) {
      const heard = progress.focusStops.map((stop) => (stop.accessibleName ? `${stop.accessibleName}, ${stop.role}` : stop.announcement));
      await explainNeverReached(session, progress, target, reach.trapFinding, reach.focusConfined);
      return finish({ blockedBecause: `"${target}" was never reached: ${reach.reason}`, closestMatches: closestMatches(target, heard) });
    }
  }

  const key: JourneyKey | null = step.dismiss ? "Enter" : (step.press ?? null);
  let observation: ActionObservation | null = null;
  if (key || step.type) {
    observation = await performAction(session, progress, step, key);
    await addFindings(session, stepNumber, [
      ...findSilentUpdates(observation),
      ...findFocusLostAfterAction(observation),
      ...findModalsWithoutFocus(observation),
    ]);
    await checkOverlays(session, stepNumber);
  }
  await checkExpectations(session, progress, step, observation);
  return finish({});
}

export async function runJourney(options: JourneyRunOptions): Promise<JourneyRunOutcome> {
  const startedAt = Date.now();
  const context = await createScanContext(options.browser);
  const page = await context.newPage();
  const session: JourneySession = {
    page,
    options,
    navigation: trackNavigation(page),
    documentMarker: "",
    pageLoadNumber: 0,
    firstAnnouncer: null,
    useScreenReader: false,
    findings: [],
    screenshots: new Map(),
    reportedKeys: new Set(),
    reachedOnThisPage: new Set(),
    transcript: [],
  };
  try {
    await loadPage(page, options.journey.startUrl, options.pageTimeoutSeconds);
    await preparePage(session, 1);
    // The page the user first faces: an overlay here belongs to step 1.
    await checkOverlays(session, 1);

    const steps: JourneyStepResult[] = [];
    let blockedAtStep: number | null = null;
    for (const [index, step] of options.journey.steps.entries()) {
      const stepNumber = index + 1;
      if (blockedAtStep !== null) {
        steps.push({
          stepNumber,
          action: describeAction(step),
          status: "not-run",
          keysPressed: [],
          focusStopsPassed: 0,
          announcements: [],
          focusBefore: null,
          focusAfter: null,
          url: page.url(),
          expectationFailures: [],
          durationMilliseconds: 0,
        });
        continue;
      }
      const result = await runStep(session, step, stepNumber);
      steps.push(result);
      if (result.status === "failed") blockedAtStep = stepNumber;
    }

    const effort = calculateEffort(
      steps.map((step, index) => {
        const definition = options.journey.steps[index];
        return {
          stepNumber: step.stepNumber,
          keysPressed: step.keysPressed,
          needsClick: Boolean(definition?.press || definition?.dismiss),
          ran: step.status !== "not-run",
        };
      }),
      blockedAtStep !== null,
    );
    const expectationFailureCount = steps.reduce((sum, step) => sum + step.expectationFailures.length, 0);
    const barrierCount = session.findings.length + expectationFailureCount;
    const announcer = session.firstAnnouncer ?? { engine: "accessibility-snapshot-fallback" as const };
    const result: JourneyResult = {
      toolVersion: TOOL_VERSION,
      journeyName: options.journey.name,
      journeyFile: options.journey.filePath,
      startUrl: options.journey.startUrl,
      finalUrl: page.url(),
      scannedAt: new Date(startedAt).toISOString(),
      engine: announcer.fallbackReason ? { name: announcer.engine, fallbackReason: announcer.fallbackReason } : { name: announcer.engine },
      viewport: { ...DESKTOP_VIEWPORT },
      outcome: blockedAtStep !== null ? "blocked" : barrierCount > 0 ? "completed-with-barriers" : "passed",
      blockedAtStep,
      barrierCount,
      steps,
      findings: session.findings,
      effort,
      transcript: session.transcript,
      durationMilliseconds: Date.now() - startedAt,
    };
    return { result, screenshots: session.screenshots };
  } catch (error) {
    if (error instanceof ScanFailedError) throw error;
    throw new ScanFailedError(`The journey "${options.journey.name}" stopped unexpectedly (${describeError(error)}).`);
  } finally {
    session.navigation.stop();
    await context.close().catch(() => {});
  }
}
