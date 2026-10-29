// Chromium's own accessibility tree, read through the DevTools protocol: the
// role and name the browser hands to screen readers. BF-002 trusts it for
// names. Engine B's snapshot computes names in JavaScript and disagrees with
// the browser in places (it gives a <summary> no name; Chromium names it
// from its text). Null whenever the tree can't be read; rules then fall back
// to Engine B and Guidepup.

import type { CDPSession, Locator, Page } from "playwright";

export interface NativeRoleAndName {
  /** Chromium's role ("link", "image", "DisclosureTriangle"…); "none" when the node is ignored. */
  role: string;
  name: string;
}

const READ_TIMEOUT_MILLISECONDS = 2_000;
/** Where the element waits on the top window between Playwright and the protocol call. */
const TARGET_KEY = "__blindfoldNativeAccessibilityTarget";

/** Chromium role names that differ from the ARIA role they stand for. */
const ARIA_ROLE_FOR_CHROMIUM_ROLE: Record<string, string> = {
  image: "img",
  DisclosureTriangle: "button",
  MenuListOption: "option",
  MenuListPopup: "listbox",
};

const sessions = new WeakMap<Page, Promise<CDPSession | null>>();

/** One protocol session per page, opened on first use. Null in browsers other than Chromium. */
function sessionFor(page: Page): Promise<CDPSession | null> {
  let session = sessions.get(page);
  if (!session) {
    session = page.context().newCDPSession(page).catch(() => null);
    sessions.set(page, session);
  }
  return session;
}

/**
 * The ARIA role for Chromium's role: mapped when Chromium has its own name
 * for it, null for other Chromium-only roles (callers use Engine B's role).
 */
export function ariaRoleForNativeRole(role: string): string | null {
  const mapped = ARIA_ROLE_FOR_CHROMIUM_ROLE[role];
  if (mapped) return mapped;
  return /^[a-z]+$/.test(role) ? role : null;
}

/**
 * Role and name of the element the locator points at, from the page's main
 * frame or a same-origin iframe (Blindfold doesn't follow focus into others).
 * The element is handed over through the top window, which a same-origin
 * frame can reach, so it works inside open shadow roots too.
 */
export async function readNativeRoleAndName(page: Page, locator: Locator): Promise<NativeRoleAndName | null> {
  const session = await sessionFor(page);
  if (!session) return null;
  try {
    await locator.evaluate(
      (element, key) => {
        (window.top as unknown as Record<string, Element>)[key] = element;
      },
      TARGET_KEY,
      { timeout: READ_TIMEOUT_MILLISECONDS },
    );
    const { result } = await session.send("Runtime.evaluate", {
      expression: `(() => { const target = window[${JSON.stringify(TARGET_KEY)}]; delete window[${JSON.stringify(TARGET_KEY)}]; return target; })()`,
    });
    if (!result.objectId) return null;
    const { nodes } = await session.send("Accessibility.getPartialAXTree", { objectId: result.objectId, fetchRelatives: false });
    await session.send("Runtime.releaseObject", { objectId: result.objectId }).catch(() => {});
    const node = nodes[0];
    if (!node) return null;
    if (node.ignored) return { role: "none", name: "" };
    const role = node.role?.value;
    const name = node.name?.value;
    if (typeof role !== "string") return null;
    return { role, name: typeof name === "string" ? name : "" };
  } catch {
    // A session that broke (e.g. detached) is opened again next time.
    sessions.delete(page);
    return null;
  }
}
