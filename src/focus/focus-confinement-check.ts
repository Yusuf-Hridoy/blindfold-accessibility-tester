// Is the page legitimately keeping focus inside a Tab cycle (a modal dialog,
// or everything else inert)? Used by the scan walk and journeys to tell a
// focus trap from a modal that confines focus on purpose.

import type { Page } from "playwright";
import type { PageElementIdentity } from "../browser/page-element-helpers.ts";

export interface CycleConfinement {
  /** Focus is legitimately kept inside: a modal dialog, or everything else is inert/aria-hidden. */
  confined: boolean;
  /** Index (into the given ids) of the cycle element that comes first in page order. */
  firstInPageOrder: number;
  /** When confined: the dialog, or the container everything else is blocked around. */
  confinedBy?: PageElementIdentity & { isDialog: boolean };
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
      return { confined: true, firstInPageOrder, confinedBy: { ...window.__blindfoldElements.identify(modalDialog), isDialog: true } };
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
    return { confined: true, firstInPageOrder, confinedBy: { ...window.__blindfoldElements.identify(container), isDialog: false } };
  }, elementIds);
}
