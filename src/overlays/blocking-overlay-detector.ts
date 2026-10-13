// BF-008 input: overlays holding mouse targets, whether they block the page,
// and whether the keyboard can reach their controls. Used by scan and run.

import type { Page } from "playwright";
import type { OverlayDetection } from "../types/scan-result-types.ts";

const MINIMUM_BLOCKING_COVERAGE = 0.25;
/** A "control" covering this much of its overlay is the overlay's surface (e.g. an app's canvas), not a control in it. */
const SURFACE_SHARE_OF_OVERLAY = 0.9;

/**
 * Groups the given mouse targets by their outermost fixed/absolute/sticky
 * ancestor (or themselves) and describes each group. Reachability is static
 * (no Tab walk), so the check never moves focus during a journey.
 */
export async function detectOverlays(page: Page, mouseTargetIds: number[]): Promise<OverlayDetection[]> {
  return page.evaluate(
    ({ targetIds, minimumCoverage, surfaceShare }) => {
      const helpers = window.__blindfoldElements;

      function isPositioned(element: Element): boolean {
        const position = getComputedStyle(element).position;
        return position === "fixed" || position === "absolute" || position === "sticky";
      }

      function outermostPositionedContainer(element: Element): Element | null {
        let container: Element | null = null;
        for (let current: Element | null = element; current && current !== document.body; current = current.parentElement) {
          if (isPositioned(current)) container = current;
        }
        return container;
      }

      function isRendered(element: Element): boolean {
        if (!element.checkVisibility({ visibilityProperty: true })) return false;
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      }

      function isInsideClosedDetails(element: Element): boolean {
        const details = element.parentElement?.closest("details:not([open])");
        if (!details) return false;
        // A closed <details> still shows its own <summary>.
        const summary = details.querySelector(":scope > summary");
        return !(summary && (summary === element || summary.contains(element)));
      }

      function isKeyboardReachable(element: Element): boolean {
        if (!(element instanceof HTMLElement || element instanceof SVGElement) || element.tabIndex < 0) return false;
        if (element.matches(":disabled") || !isRendered(element)) return false;
        if (element.closest("[inert], [hidden]") || isInsideClosedDetails(element)) return false;
        return true;
      }

      function viewportCoverage(element: Element): number {
        const box = element.getBoundingClientRect();
        const width = Math.max(0, Math.min(box.right, window.innerWidth) - Math.max(box.left, 0));
        const height = Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0));
        return (width * height) / (window.innerWidth * window.innerHeight);
      }

      /** Every other top-level part of the page is inert or aria-hidden. */
      function isRestOfPageBlocked(container: Element): boolean {
        let topLevel: Element = container;
        while (topLevel.parentElement && topLevel.parentElement !== document.body) topLevel = topLevel.parentElement;
        const others = Array.from(document.body.children).filter(
          (child) => child !== topLevel && !["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"].includes(child.tagName),
        );
        const blocked = (element: Element) =>
          (element instanceof HTMLElement && element.inert) || element.getAttribute("aria-hidden") === "true";
        const visibleOthers = others.filter((element) => blocked(element) || isRendered(element));
        return visibleOthers.length > 0 && visibleOthers.every(blocked);
      }

      /** Visible (opacity included) and on top: the hit test at the centre of its on-screen part lands on it. */
      function isShownOnTop(container: Element): boolean {
        if (!container.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
        const box = container.getBoundingClientRect();
        const left = Math.max(box.left, 0);
        const right = Math.min(box.right, window.innerWidth);
        const top = Math.max(box.top, 0);
        const bottom = Math.min(box.bottom, window.innerHeight);
        if (right <= left || bottom <= top) return false;
        const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
        return hit !== null && (hit === container || container.contains(hit));
      }

      function isSurfaceOf(target: Element, container: Element): boolean {
        const targetBox = target.getBoundingClientRect();
        const containerBox = container.getBoundingClientRect();
        const containerArea = containerBox.width * containerBox.height;
        return containerArea > 0 && (targetBox.width * targetBox.height) / containerArea >= surfaceShare;
      }

      const targetsByContainer = new Map<Element, Element[]>();
      for (const targetId of targetIds) {
        const target = helpers.elementForId(targetId);
        if (!target || !target.isConnected) continue;
        const container = outermostPositionedContainer(target);
        if (!container || isSurfaceOf(target, container)) continue;
        targetsByContainer.set(container, [...(targetsByContainer.get(container) ?? []), target]);
      }

      return Array.from(targetsByContainer)
        .filter(([container]) => isShownOnTop(container))
        .map(([container, targets]) => {
          const coverage = viewportCoverage(container);
          const restOfPageBlocked = isRestOfPageBlocked(container);
          return {
            container: helpers.identify(container),
            controls: targets.map((target) => ({ ...helpers.identify(target), keyboardReachable: isKeyboardReachable(target) })),
            viewportCoverage: Math.round(coverage * 1000) / 1000,
            restOfPageBlocked,
            blocksPage: coverage >= minimumCoverage || restOfPageBlocked,
          };
        });
    },
    { targetIds: mouseTargetIds, minimumCoverage: MINIMUM_BLOCKING_COVERAGE, surfaceShare: SURFACE_SHARE_OF_OVERLAY },
  );
}
