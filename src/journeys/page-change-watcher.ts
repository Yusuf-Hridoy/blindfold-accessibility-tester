// What changed after a journey action: navigation, DOM settling, text that
// visibly appeared (BF-005) and dialogs that are open (BF-007, expect_closed).

import type { Page, Request } from "playwright";
import type { PageElementIdentity } from "../browser/page-element-helpers.ts";

interface PageChangeRecord {
  documentMarker: string;
  changedElements: Set<Element>;
  lastMutationAt: number;
}

declare global {
  interface Window {
    __blindfoldPageChanges?: PageChangeRecord;
  }
}

export interface AppearedText extends PageElementIdentity {
  inLiveRegion: boolean;
  focusOnIt: boolean;
}

export interface VisibleDialog extends PageElementIdentity {
  focusInside: boolean;
}

const QUIET_PERIOD_MILLISECONDS = 300;
const SETTLE_CAP_MILLISECONDS = 3_000;
const POLL_INTERVAL_MILLISECONDS = 50;

const MODAL_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]';
// expect_closed also covers popups that aren't dialogs.
const CLOSABLE_SELECTOR = `${MODAL_SELECTOR}, [role="menu"], [role="listbox"], [role="tooltip"]`;

/** Starts recording DOM changes in the current document; returns a marker that identifies it. */
export async function installPageChangeWatcher(page: Page): Promise<string> {
  const documentMarker = `blindfold-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.evaluate((marker) => {
    const record: PageChangeRecord = { documentMarker: marker, changedElements: new Set(), lastMutationAt: performance.now() };
    const observer = new MutationObserver((mutations) => {
      record.lastMutationAt = performance.now();
      for (const mutation of mutations) {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        if (target) record.changedElements.add(target);
        for (const added of mutation.addedNodes) {
          if (added instanceof Element) record.changedElements.add(added);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    window.__blindfoldPageChanges = record;
  }, documentMarker);
  return documentMarker;
}

/** Forget earlier changes; call right before an action. */
export async function resetPageChanges(page: Page): Promise<void> {
  await page.evaluate(() => window.__blindfoldPageChanges?.changedElements.clear());
}

/** Watches for the main frame starting to load a new document. */
export function trackNavigation(page: Page) {
  let pendingRequest: Request | null = null;
  let failed = false;
  let responseStatus: number | null = null;
  const onRequest = (request: Request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      pendingRequest = request;
      failed = false;
    }
  };
  const onRequestFailed = (request: Request) => {
    if (request === pendingRequest) failed = true;
  };
  const onResponse = (response: { request(): Request; status(): number }) => {
    if (response.request() === pendingRequest) responseStatus = response.status();
  };
  page.on("request", onRequest);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);
  return {
    reset(): void {
      pendingRequest = null;
      failed = false;
      responseStatus = null;
    },
    isNavigating: (): boolean => pendingRequest !== null && !failed,
    responseStatus: (): number | null => responseStatus,
    stop(): void {
      page.off("request", onRequest);
      page.off("requestfailed", onRequestFailed);
      page.off("response", onResponse);
    },
  };
}

export type NavigationTracker = ReturnType<typeof trackNavigation>;

/**
 * Waits after an action until a new document has loaded, or the DOM has been
 * quiet for 300 ms (capped at 3 s). Returns whether a new document loaded.
 */
export async function waitForPageToSettle(
  page: Page,
  documentMarker: string,
  navigation: NavigationTracker,
  pageTimeoutSeconds: number,
): Promise<{ newDocument: boolean }> {
  const startedAt = Date.now();
  for (;;) {
    await page.waitForTimeout(POLL_INTERVAL_MILLISECONDS);
    let state: { sameDocument: boolean; quietFor: number };
    try {
      state = await page.evaluate((marker) => {
        const record = window.__blindfoldPageChanges;
        return {
          sameDocument: record?.documentMarker === marker,
          quietFor: record ? performance.now() - record.lastMutationAt : Number.POSITIVE_INFINITY,
        };
      }, documentMarker);
    } catch {
      // The old document was torn down mid-check: a navigation is committing.
      state = { sameDocument: false, quietFor: 0 };
    }
    if (!state.sameDocument) {
      await page.waitForLoadState("load", { timeout: pageTimeoutSeconds * 1000 });
      return { newDocument: true };
    }
    const elapsed = Date.now() - startedAt;
    // A requested navigation can take longer than the DOM cap; wait up to the page timeout.
    if (navigation.isNavigating() && elapsed < pageTimeoutSeconds * 1000) continue;
    if (state.quietFor >= QUIET_PERIOD_MILLISECONDS || elapsed >= SETTLE_CAP_MILLISECONDS) return { newDocument: false };
  }
}

/** The smallest visible element that changed since the last reset and now shows `text`. */
export async function findAppearedText(page: Page, text: string): Promise<AppearedText | null> {
  return page.evaluate((expected) => {
    const helpers = window.__blindfoldElements;
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
    const wanted = normalize(expected);
    const showsText = (element: Element) =>
      element instanceof HTMLElement && helpers.isVisible(element) && normalize(element.innerText).includes(wanted);

    const changed = [...(window.__blindfoldPageChanges?.changedElements ?? [])].filter(
      (element) => element.isConnected && showsText(element),
    );
    if (changed.length === 0) return null;
    // Narrow down from a changed container to the element that holds the text.
    let match = changed.sort((first, second) => (first as HTMLElement).innerText.length - (second as HTMLElement).innerText.length)[0] as Element;
    for (let child = Array.from(match.children).find(showsText); child; child = Array.from(match.children).find(showsText)) {
      match = child;
    }
    const focused = document.activeElement;
    const focusOnIt = !!focused && focused !== document.body && (match.contains(focused) || focused.contains(match));
    const liveRegion = match.closest('[role="status"], [role="alert"], [role="log"], [aria-live]:not([aria-live="off"]), output');
    return { ...helpers.identify(match), inLiveRegion: liveRegion !== null, focusOnIt };
  }, text);
}

async function listVisible(page: Page, selector: string): Promise<VisibleDialog[]> {
  return page.evaluate((matchSelector) => {
    const helpers = window.__blindfoldElements;
    const focused = document.activeElement;
    return Array.from(document.querySelectorAll(matchSelector))
      .filter((element) => helpers.isVisible(element))
      .map((element) => ({
        ...helpers.identify(element),
        focusInside: !!focused && focused !== document.body && element.contains(focused),
      }));
  }, selector);
}

/** Visible dialogs: role dialog/alertdialog, aria-modal, or an open <dialog>. */
export function listVisibleModals(page: Page): Promise<VisibleDialog[]> {
  return listVisible(page, MODAL_SELECTOR);
}

/** Visible dialogs and popups (menu, listbox, tooltip), for expect_closed. */
export function listVisibleClosables(page: Page): Promise<VisibleDialog[]> {
  return listVisible(page, CLOSABLE_SELECTOR);
}

/** The focused element (only if it's a container, not a control) and its ancestors, innermost first. */
export async function listFocusContainers(page: Page): Promise<PageElementIdentity[]> {
  return page.evaluate(() => {
    const helpers = window.__blindfoldElements;
    const focused = document.activeElement;
    if (!focused || focused === document.body) return [];
    const containerRoles = ["dialog", "alertdialog", "region", "form", "group", "document"];
    const containers: Element[] = containerRoles.includes(focused.getAttribute("role") ?? "") || focused.localName === "dialog" ? [focused] : [];
    for (let ancestor = focused.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      containers.push(ancestor);
    }
    return containers.map((element) => helpers.identify(element));
  });
}

export interface CycleConfinement {
  /** Focus is legitimately kept inside: a modal dialog, or everything else is inert/aria-hidden. */
  confined: boolean;
  /** Index (into the given ids) of the cycle element that comes first in page order. */
  firstInPageOrder: number;
}

/**
 * For a Tab cycle that never passed the end of the page: is the page
 * legitimately confining focus there? True for a cycle inside an open modal
 * <dialog>, inside role="dialog"/"alertdialog" with aria-modal="true"
 * (script-managed focus is the standard ARIA dialog pattern), or when
 * everything outside the cycle's container is inert or aria-hidden.
 */
export async function checkCycleConfinement(page: Page, elementIds: number[]): Promise<CycleConfinement> {
  return page.evaluate((ids) => {
    const elements = ids
      .map((id) => window.__blindfoldElements.elementForId(id))
      .filter((element): element is Element => element !== undefined && element.isConnected);
    const firstInPageOrder = elements.reduce(
      (earliest, element, index) =>
        elements[earliest] && element.compareDocumentPosition(elements[earliest]) & Node.DOCUMENT_POSITION_FOLLOWING ? index : earliest,
      0,
    );
    let container: Element | null = elements[0] ?? null;
    while (container && !elements.every((element) => container?.contains(element))) container = container.parentElement;
    if (!container) return { confined: false, firstInPageOrder };

    const modalDialog = container.closest('dialog, [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]');
    if (modalDialog && (modalDialog.localName !== "dialog" || modalDialog.matches(":modal"))) {
      return { confined: true, firstInPageOrder };
    }

    const ignoredTags = ["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"];
    const isBlocked = (element: Element) =>
      (element instanceof HTMLElement && element.inert) || element.getAttribute("aria-hidden") === "true";
    const isRendered = (element: Element) => element.checkVisibility({ visibilityProperty: true });
    for (let node: Element = container; node !== document.body && node.parentElement; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling === node || ignoredTags.includes(sibling.tagName)) continue;
        if (!isBlocked(sibling) && isRendered(sibling)) return { confined: false, firstInPageOrder };
      }
    }
    return { confined: true, firstInPageOrder };
  }, elementIds);
}
