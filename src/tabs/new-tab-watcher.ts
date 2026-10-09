// Notices tabs and windows an action opens (target="_blank" links, window.open),
// and the HTTP status of their first page, so a journey can follow them.

import type { BrowserContext, Page, Response } from "playwright";

export interface NewTabWatcher {
  /** Tabs opened since the watcher started; waits up to `waitMilliseconds` for the first one. */
  openedTabs(waitMilliseconds: number): Promise<Page[]>;
  /** The HTTP status of the tab's latest page load, or null when none was seen (e.g. about:blank). */
  statusOf(tab: Page): number | null;
  stop(): void;
}

const POLL_INTERVAL_MILLISECONDS = 50;

export function watchForNewTabs(context: BrowserContext): NewTabWatcher {
  const opened: Page[] = [];
  const statuses = new Map<Page, number>();
  // A new tab's first request is sent before its frame exists, so it can only be matched by URL.
  const statusesByUrl = new Map<string, number>();
  const onPage = (page: Page) => {
    opened.push(page);
  };
  // Listened to on the context, so a tab's very first response isn't missed
  // before the "page" event hands over the tab.
  const onResponse = (response: Response) => {
    const request = response.request();
    if (!request.isNavigationRequest()) return;
    statusesByUrl.set(response.url(), response.status());
    try {
      const frame = request.frame();
      if (frame === frame.page().mainFrame()) statuses.set(frame.page(), response.status());
    } catch {
      // No frame yet (a new tab's first page) or none at all (a service worker).
    }
  };
  context.on("page", onPage);
  context.on("response", onResponse);

  return {
    async openedTabs(waitMilliseconds: number): Promise<Page[]> {
      const deadline = Date.now() + waitMilliseconds;
      while (opened.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MILLISECONDS));
      }
      return [...opened];
    },
    statusOf: (tab: Page): number | null => statuses.get(tab) ?? statusesByUrl.get(tab.url()) ?? null,
    stop(): void {
      context.off("page", onPage);
      context.off("response", onResponse);
    },
  };
}
