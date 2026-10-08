// Engine B: role and accessible name from Playwright's ARIA snapshot, which
// reads Chromium's own accessibility tree. Rules use this structured data, and
// it becomes the transcript text when the screen reader can't start.

import type { Locator, Page } from "playwright";

export interface RoleAndName {
  /** "unknown" when the snapshot couldn't be read; rules ignore those. */
  role: string;
  name: string;
}

const SNAPSHOT_TIMEOUT_MILLISECONDS = 2_000;

/**
 * Parses the first line of an ARIA snapshot, e.g. `- button "Cart"` or
 * `- link "Shop":`. Generic elements appear as `- text: ...` and have no name.
 * An empty snapshot means the element is hidden from assistive technology.
 */
export function parseAriaSnapshotFirstLine(snapshot: string): RoleAndName {
  const firstLine = (snapshot.split("\n")[0] ?? "").trim();
  if (firstLine === "") return { role: "none", name: "" };
  if (firstLine.startsWith("- text:")) return { role: "generic", name: "" };
  const match = /^- ([a-z]+)(?: ("(?:[^"\\]|\\.)*"))?/.exec(firstLine);
  if (!match) return { role: "unknown", name: "" };
  const quotedName = match[2];
  return { role: match[1] ?? "unknown", name: quotedName ? (JSON.parse(quotedName) as string) : "" };
}

export async function readRoleAndName(locator: Locator): Promise<RoleAndName> {
  try {
    const snapshot = await locator.ariaSnapshot({ timeout: SNAPSHOT_TIMEOUT_MILLISECONDS });
    return parseAriaSnapshotFirstLine(snapshot);
  } catch {
    return { role: "unknown", name: "" };
  }
}

export async function readFocusedRoleAndName(page: Page): Promise<RoleAndName> {
  return readRoleAndName(page.locator(":focus").first());
}

/** Screen-reader-style text for fallback mode, e.g. `button, Cart` or just `button`. */
export function formatAsAnnouncement(roleAndName: RoleAndName): string {
  return roleAndName.name ? `${roleAndName.role}, ${roleAndName.name}` : roleAndName.role;
}
