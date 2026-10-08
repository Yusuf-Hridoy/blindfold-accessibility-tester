import { chromium, type Browser, type BrowserContext } from "playwright";
import { installClickListenerTracker } from "./click-listener-tracker.ts";
import { installPageElementHelpers } from "./page-element-helpers.ts";

export const DESKTOP_VIEWPORT = { width: 1280, height: 800 } as const;

// tsx compiles named functions with a `__name(fn, "name")` helper. Functions we
// send into the page carry those calls but not the helper, so define a no-op.
const NAME_HELPER_SHIM = "globalThis.__name ??= (target) => target;";

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

/** A fresh desktop context with Blindfold's page helpers installed before any page script runs. */
export async function createScanContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: DESKTOP_VIEWPORT,
    // Lets the screen reader be injected on sites with a strict Content Security Policy.
    bypassCSP: true,
  });
  await context.addInitScript({ content: NAME_HELPER_SHIM });
  await context.addInitScript(installPageElementHelpers);
  await context.addInitScript(installClickListenerTracker);
  return context;
}
