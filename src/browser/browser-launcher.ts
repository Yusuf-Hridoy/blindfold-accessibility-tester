import { chromium, type Browser, type BrowserContext } from "playwright";
import type { SessionState } from "../sessions/session-file-loader.ts";
import { installClickListenerTracker } from "./click-listener-tracker.ts";
import { installPageElementHelpers } from "./page-element-helpers.ts";
import { VIEWPORT_PRESETS, type ViewportName } from "./viewport-presets.ts";

export const DESKTOP_VIEWPORT = { width: VIEWPORT_PRESETS.desktop.width, height: VIEWPORT_PRESETS.desktop.height } as const;

// tsx compiles named functions with a `__name(fn, "name")` helper. Functions we
// send into the page carry those calls but not the helper, so define a no-op.
const NAME_HELPER_SHIM = "globalThis.__name ??= (target) => target;";

export interface ScanContextOptions {
  viewport?: ViewportName;
  /** A saved login (from `blindfold login`), loaded before the first page. */
  session?: SessionState;
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

/** A fresh context with Blindfold's page helpers installed (in every frame) before any page script runs. */
export async function createScanContext(browser: Browser, options: ScanContextOptions = {}): Promise<BrowserContext> {
  const preset = VIEWPORT_PRESETS[options.viewport ?? "desktop"];
  const context = await browser.newContext({
    viewport: { width: preset.width, height: preset.height },
    isMobile: preset.isMobile,
    hasTouch: preset.hasTouch,
    deviceScaleFactor: preset.deviceScaleFactor,
    // Lets the screen reader be injected on sites with a strict Content Security Policy.
    bypassCSP: true,
    ...(options.session ? { storageState: options.session } : {}),
  });
  await context.addInitScript({ content: NAME_HELPER_SHIM });
  await context.addInitScript(installPageElementHelpers);
  await context.addInitScript(installClickListenerTracker);
  return context;
}
