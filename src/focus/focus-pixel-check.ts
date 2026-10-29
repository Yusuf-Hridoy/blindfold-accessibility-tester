// Pixel confirmation for BF-004. The style check compares a fixed set of
// properties on the element and a few relatives, so it misses indicators
// drawn elsewhere (a child, a distant ancestor's ::after) or still in a CSS
// transition. When the style check finds no change, the element's area is
// photographed while it has focus and again after focus has left it (each
// time once transitions and animations have finished, at most 500 ms). Only
// if the pixels are identical too is focus invisible. Content that moves on
// its own can make a real problem look visible; missing that is preferred
// over a false alarm.

import type { Locator, Page } from "playwright";
import type { FocusStop } from "../types/scan-result-types.ts";

const SETTLE_CAP_MILLISECONDS = 500;
/** Indicators are often drawn around the element (a card frame, an offset ring): photograph that much around it. */
const AREA_PADDING = 32;
const HIDE_RING_STYLE_ID = "blindfold-hide-current-focus-ring";

/**
 * Waits until running CSS transitions and animations end on the element, its
 * ancestors and descendants (including their ::before/::after), and anything
 * drawn over the photographed area (e.g. a dropdown opening next to it), at
 * most 500 ms. Infinite animations and animations elsewhere on the page (a
 * carousel further down) are ignored, so they don't slow every check down.
 */
async function waitForStylesToSettle(locator: Locator): Promise<void> {
  await locator
    .evaluate(async (element, { capMilliseconds, padding }) => {
      // Reading a style makes the browser start the transitions the focus change triggered.
      getComputedStyle(element).color;
      const area = element.getBoundingClientRect();
      const overlapsArea = (target: Element): boolean => {
        const box = target.getBoundingClientRect();
        return box.right >= area.left - padding && box.left <= area.right + padding && box.bottom >= area.top - padding && box.top <= area.bottom + padding;
      };
      const finishing = document.getAnimations().filter((animation) => {
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
        if (!target) return false;
        const related = target === element || element.contains(target) || target.contains(element);
        if (!related && !overlapsArea(target)) return false;
        const endTime = animation.effect?.getComputedTiming().endTime;
        return animation.playState === "running" && endTime !== undefined && Number.isFinite(Number(endTime));
      });
      if (finishing.length === 0) return;
      await Promise.race([
        Promise.allSettled(finishing.map((animation) => animation.finished)),
        new Promise((resolve) => setTimeout(resolve, capMilliseconds)),
      ]);
    }, { capMilliseconds: SETTLE_CAP_MILLISECONDS, padding: AREA_PADDING })
    .catch(() => {});
}

/**
 * While photographing the area after focus left it, the element that has
 * focus now may sit a few pixels away. When its own focus ring is an outline
 * or box-shadow that appeared with focus, that ring is hidden for the moment
 * of the photo so it can't spill into the area.
 */
async function hideCurrentFocusRing(page: Page, ring: { outline: boolean; boxShadow: boolean } | null): Promise<void> {
  await page
    .evaluate(
      ({ styleId, hide }) => {
        for (const old of document.querySelectorAll(`#${styleId}`)) old.remove();
        for (const shadowRoot of window.__blindfoldElements?.deepShadowRoots(document) ?? []) shadowRoot.getElementById(styleId)?.remove();
        if (!hide || (!hide.outline && !hide.boxShadow)) return;
        const style = document.createElement("style");
        style.id = styleId;
        const declarations = [hide.outline ? "outline: none !important;" : "", hide.boxShadow ? "box-shadow: none !important;" : ""].join(" ");
        style.textContent = `:focus, :focus-visible { ${declarations} }`;
        // Document styles don't reach into a shadow root: put it where the focused element lives.
        const focused = window.__blindfoldElements?.deepActiveElement() ?? document.activeElement;
        const root = focused?.getRootNode();
        if (root instanceof ShadowRoot) root.append(style);
        else document.head.append(style);
      },
      { styleId: HIDE_RING_STYLE_ID, hide: ring },
    )
    .catch(() => {});
}

/** The element's box plus padding, clipped to the viewport; null when it isn't on screen. */
async function photographArea(page: Page, locator: Locator): Promise<Buffer | null> {
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 2_000 });
    const box = await locator.boundingBox({ timeout: 2_000 });
    const viewport = page.viewportSize();
    if (!box || !viewport) return null;
    const x = Math.max(0, Math.floor(box.x - AREA_PADDING));
    const y = Math.max(0, Math.floor(box.y - AREA_PADDING));
    const width = Math.min(viewport.width, Math.ceil(box.x + box.width + AREA_PADDING)) - x;
    const height = Math.min(viewport.height, Math.ceil(box.y + box.height + AREA_PADDING)) - y;
    if (width <= 0 || height <= 0) return null;
    // caret "hide": a blinking text caret would make two photos differ at random.
    return await page.screenshot({ clip: { x, y, width, height }, type: "png", caret: "hide" });
  } catch {
    return null;
  }
}

interface PendingCheck {
  stop: FocusStop;
  locator: Locator;
  url: string;
  focusedImage: Buffer;
}

/**
 * Settles BF-004 for stops whose style check found no change. Call `focused`
 * right after such a stop is recorded and `focusMoved` after every later key
 * press. The stop's `focusVisible` becomes true (the pixels changed), stays
 * false (they didn't), or "unknown" (the check couldn't finish).
 */
export class FocusPixelCheck {
  #pending: PendingCheck | null = null;

  /**
   * `onSettled` is called once per stop given to `focused`, when its focus
   * visibility is final: at once when no check is needed, or when the check
   * settles (live progress reports the stop then).
   */
  constructor(
    private readonly page: Page,
    private readonly locatorFor: (stop: FocusStop) => Locator,
    private readonly onSettled: (stop: FocusStop) => void = () => {},
  ) {}

  /**
   * The stop that has focus now. `check: false` skips the check (e.g. BF-004
   * already reported for it). Returns the photo taken while focused (also
   * usable as the finding's screenshot), or null when no check is waiting.
   */
  async focused(stop: FocusStop, check = true): Promise<Buffer | null> {
    if (stop.focusVisible !== false || !check) {
      this.onSettled(stop);
      return null;
    }
    const locator = this.locatorFor(stop);
    await waitForStylesToSettle(locator);
    const focusedImage = await photographArea(this.page, locator);
    if (!focusedImage) {
      this.#settle(stop, "not-checked");
      return null;
    }
    this.#pending = { stop, locator, url: this.page.url(), focusedImage };
    return focusedImage;
  }

  /**
   * After a key press. `nowFocused` is the element that has focus now (null
   * for the page body), with the style changes focus caused on it if known;
   * while it's still the pending element, focus hasn't left and the check waits.
   */
  async focusMoved(nowFocused: Pick<FocusStop, "elementId" | "focusStyleChanges"> | null): Promise<FocusStop | null> {
    const pending = this.#pending;
    if (!pending || nowFocused?.elementId === pending.stop.elementId) return null;
    this.#pending = null;
    if (this.page.url() !== pending.url) {
      this.#settle(pending.stop, "not-checked");
      return pending.stop;
    }
    await waitForStylesToSettle(pending.locator);
    // Only a ring that appeared with focus (its outline style changed, e.g. from
    // none) is hidden; an outline that's always there stays as it was.
    const changes = nowFocused?.focusStyleChanges ?? [];
    const ring = { outline: changes.includes("element.outline-style"), boxShadow: changes.includes("element.box-shadow") };
    await hideCurrentFocusRing(this.page, ring);
    const unfocusedImage = await photographArea(this.page, pending.locator);
    await hideCurrentFocusRing(this.page, null);
    this.#settle(pending.stop, unfocusedImage === null ? "not-checked" : unfocusedImage.equals(pending.focusedImage) ? "unchanged" : "changed");
    return pending.stop;
  }

  /** The walk or journey ended while a check was still waiting for focus to leave. */
  abandon(): void {
    if (this.#pending) this.#settle(this.#pending.stop, "not-checked");
    this.#pending = null;
  }

  /** A check is waiting for focus to leave its element. */
  isWaiting(): boolean {
    return this.#pending !== null;
  }

  #settle(stop: FocusStop, result: NonNullable<FocusStop["focusPixelCheck"]>): void {
    stop.focusPixelCheck = result;
    if (result === "changed") stop.focusVisible = true;
    if (result === "not-checked") stop.focusVisible = "unknown";
    this.onSettled(stop);
  }
}
