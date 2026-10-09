// The screen sizes Blindfold can test at. Mobile keeps hasTouch off: Blindfold
// tests keyboard users, and touch emulation would change how pages behave.

export const VIEWPORT_NAMES = ["desktop", "mobile"] as const;

export type ViewportName = (typeof VIEWPORT_NAMES)[number];

export interface ViewportPreset {
  name: ViewportName;
  width: number;
  height: number;
  isMobile: boolean;
  hasTouch: boolean;
  deviceScaleFactor: number;
}

export const VIEWPORT_PRESETS: Record<ViewportName, ViewportPreset> = {
  desktop: { name: "desktop", width: 1280, height: 800, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  mobile: { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: false, deviceScaleFactor: 2 },
};

export function isViewportName(value: string): value is ViewportName {
  return (VIEWPORT_NAMES as readonly string[]).includes(value);
}

/** e.g. "1280 × 800 (desktop)" */
export function describeViewport(viewport: { width: number; height: number; name?: ViewportName }): string {
  const size = `${viewport.width} × ${viewport.height}`;
  return viewport.name ? `${size} (${viewport.name})` : size;
}
