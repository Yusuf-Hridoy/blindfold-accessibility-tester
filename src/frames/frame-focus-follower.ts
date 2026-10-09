// Follows keyboard focus into iframes. Same-origin frames are tested like the
// page itself; a frame from another origin is a boundary Blindfold doesn't test.
//
// Element ids are counted separately in every frame, so ids from inside frames
// are mapped to page-wide ids starting at 1,000,000. Main-frame ids are kept
// as they are, so everything that works on the page alone is unchanged.

import type { Frame, Locator, Page } from "playwright";
import { startScreenReaderAnnouncer } from "../announcer/screen-reader-announcer.ts";
import type { PageElementIdentity } from "../browser/page-element-helpers.ts";
import { recordFocusStyleBaselines } from "../focus/focus-style-baseline.ts";

/** Joins the iframe path in selectors, e.g. `iframe#reviews >>> button.vote`. */
export const FRAME_PATH_SEPARATOR = " >>> ";

const FIRST_FRAME_ELEMENT_ID = 1_000_000;

export interface FocusedElement extends PageElementIdentity {
  insideAriaHidden: boolean;
  hasPresentationalRole: boolean;
  /** The frame holding the element: the main frame, or a same-origin iframe. */
  frame: Frame;
  /** The element's own id in the main frame, or the id of the outermost iframe holding it. */
  mainFrameElementId: number;
  /** Set when focus is inside a frame from another origin. The identity is then the iframe's. */
  thirdPartyOrigin?: string;
}

interface FocusInFrame extends PageElementIdentity {
  insideAriaHidden: boolean;
  hasPresentationalRole: boolean;
  isFrame: boolean;
}

interface FrameIdRegistry {
  nextId: number;
  idsByFrame: WeakMap<Frame, Map<number, number>>;
  mainFrameIdById: Map<number, number>;
}

const registries = new WeakMap<Page, FrameIdRegistry>();

function registryFor(page: Page): FrameIdRegistry {
  let registry = registries.get(page);
  if (!registry) {
    registry = { nextId: FIRST_FRAME_ELEMENT_ID, idsByFrame: new WeakMap(), mainFrameIdById: new Map() };
    registries.set(page, registry);
  }
  return registry;
}

/** A page-wide id for an element inside a frame; the same element always gets the same id. */
function pageWideId(page: Page, frame: Frame, localId: number, mainFrameElementId: number): number {
  const registry = registryFor(page);
  let ids = registry.idsByFrame.get(frame);
  if (!ids) {
    ids = new Map();
    registry.idsByFrame.set(frame, ids);
  }
  let id = ids.get(localId);
  if (id === undefined) {
    id = registry.nextId++;
    ids.set(localId, id);
    registry.mainFrameIdById.set(id, mainFrameElementId);
  }
  return id;
}

/** For page-order checks in the main document: a frame element counts as its outermost iframe. */
export function mainFrameElementIdFor(page: Page, elementId: number): number {
  return registries.get(page)?.mainFrameIdById.get(elementId) ?? elementId;
}

/** The frame's origin; about:blank and srcdoc frames share their parent's. */
export function effectiveOrigin(frame: Frame): string {
  const url = frame.url();
  if (url === "" || url.startsWith("about:")) {
    const parent = frame.parentFrame();
    return parent ? effectiveOrigin(parent) : "null";
  }
  try {
    return new URL(url).origin;
  } catch {
    return "null";
  }
}

/** e.g. "payments.example" for https://payments.example */
export function describeOrigin(origin: string): string {
  try {
    return new URL(origin).host || origin;
  } catch {
    return origin;
  }
}

/** Child frames with the page's own origin, which Blindfold tests like the page. */
export function listSameOriginFrames(page: Page): Frame[] {
  const main = page.mainFrame();
  const pageOrigin = effectiveOrigin(main);
  return page.frames().filter((frame) => frame !== main && !frame.isDetached() && effectiveOrigin(frame) === pageOrigin);
}

/**
 * Gets same-origin frames ready like the page: focus baselines and, when the
 * page uses it, the screen reader. A frame that fails keeps Engine B text.
 */
export async function prepareSameOriginFrames(page: Page, useScreenReader: boolean): Promise<void> {
  for (const frame of listSameOriginFrames(page)) {
    try {
      await recordFocusStyleBaselines(frame);
      if (useScreenReader) await startScreenReaderAnnouncer(frame);
    } catch {
      // A frame can be detached or still loading; its elements report "unknown" focus visibility.
    }
  }
}

function readFocusInFrame(): FocusInFrame | null {
  const focused = document.activeElement;
  if (!focused || focused === document.body || focused === document.documentElement) return null;
  // Frames whose document Blindfold couldn't prepare (e.g. an about:blank written by script).
  if (!window.__blindfoldElements) return null;
  const firstRole = (focused.getAttribute("role") ?? "").trim().split(/\s+/)[0];
  return {
    ...window.__blindfoldElements.identify(focused),
    insideAriaHidden: focused.closest('[aria-hidden="true"]') !== null,
    hasPresentationalRole: firstRole === "none" || firstRole === "presentation",
    isFrame: focused.localName === "iframe" || focused.localName === "frame",
  };
}

async function contentFrameOfFocusedElement(frame: Frame): Promise<Frame | null> {
  const handle = await frame.evaluateHandle(() => document.activeElement);
  try {
    const element = handle.asElement();
    return element ? await element.contentFrame() : null;
  } finally {
    await handle.dispose();
  }
}

/** Focus is on an iframe element: find the element inside it (through nested same-origin frames). */
async function followIntoFrame(page: Page, host: FocusedElement): Promise<FocusedElement> {
  const childFrame = await contentFrameOfFocusedElement(host.frame).catch(() => null);
  if (!childFrame) return host;
  const origin = effectiveOrigin(childFrame);
  if (origin !== effectiveOrigin(page.mainFrame())) return { ...host, thirdPartyOrigin: describeOrigin(origin) };

  const inner = await childFrame.evaluate(readFocusInFrame).catch(() => null);
  // Focus on the frame's own document: the iframe itself is the stop.
  if (!inner) return host;
  const element: FocusedElement = {
    elementId: pageWideId(page, childFrame, inner.elementId, host.mainFrameElementId),
    selector: `${host.selector}${FRAME_PATH_SEPARATOR}${inner.selector}`,
    description: `${inner.description} in ${host.description}`,
    insideAriaHidden: inner.insideAriaHidden || host.insideAriaHidden,
    hasPresentationalRole: inner.hasPresentationalRole,
    frame: childFrame,
    mainFrameElementId: host.mainFrameElementId,
  };
  return inner.isFrame ? followIntoFrame(page, element) : element;
}

/** The focused element and its hiding attributes, following focus into iframes; null for the page body. */
export async function identifyFocusedElement(page: Page): Promise<FocusedElement | null> {
  const main = page.mainFrame();
  const top = await main.evaluate(readFocusInFrame);
  if (!top) return null;
  const { isFrame, ...identity } = top;
  const element: FocusedElement = { ...identity, frame: main, mainFrameElementId: top.elementId };
  return isFrame ? followIntoFrame(page, element) : element;
}

/** The focused element as a locator, inside whichever frame holds it. */
export function focusedElementLocator(focused: FocusedElement): Locator {
  return focused.frame.locator(":focus").first();
}

/** A locator for a selector that may contain an iframe path (`iframe#reviews >>> button.vote`). */
export function locatorForSelector(page: Page, selector: string): Locator {
  const [first, ...insideFrames] = selector.split(FRAME_PATH_SEPARATOR);
  let locator = page.locator(first ?? selector).first();
  for (const part of insideFrames) locator = locator.contentFrame().locator(part).first();
  return locator;
}
