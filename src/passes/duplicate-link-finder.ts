// Links taken out of the Tab order (e.g. a card's title link with
// tabindex="-1") whose destination another, keyboard-reachable link on the
// page already goes to. Keyboard users lose nothing, so they're not BF-001.

import type { Page } from "playwright";

/**
 * The unreached candidates that are <a href> links with a reachable twin.
 * Destinations are absolute URLs. For another page the #fragment is ignored
 * (/product = /product#reviews); for this page it's the section, so it must match.
 */
export async function findDuplicateLinks(page: Page, candidateIds: number[], reachedIds: number[]): Promise<number[]> {
  if (candidateIds.length === 0 || reachedIds.length === 0) return [];
  return page.evaluate(
    ({ candidates, reached }) => {
      const helpers = window.__blindfoldElements;
      const withoutFragment = (url: string): string => url.split("#")[0] ?? url;
      const thisPage = withoutFragment(document.URL);

      function destinationOf(element: Element | undefined): string | null {
        if (!(element instanceof HTMLAnchorElement) || !element.hasAttribute("href")) return null;
        const url = element.href;
        if (url === "" || /^javascript:/i.test(url)) return null;
        const address = withoutFragment(url);
        return address === thisPage ? url : address;
      }

      const reachableDestinations = new Set(reached.map((id) => destinationOf(helpers.elementForId(id))).filter((url) => url !== null));
      return candidates.filter((id) => {
        const destination = destinationOf(helpers.elementForId(id));
        return destination !== null && reachableDestinations.has(destination);
      });
    },
    { candidates: candidateIds, reached: reachedIds },
  );
}
