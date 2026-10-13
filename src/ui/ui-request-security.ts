// Request checks for the local web UI. The session token stops other websites
// open in the same browser from starting scans; the Host check blocks DNS
// rebinding; the Origin check refuses cross-site POSTs. CORS headers are never
// sent, so other origins can't read any response.

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

/** API calls send the token in this header (EventSource can't, so it uses ?token=). */
export const TOKEN_HEADER = "x-blindfold-token";

/** Every response. no-referrer keeps the token in the page URL from leaking to sites the page links to. */
export const BASE_SECURITY_HEADERS: Record<string, string> = {
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
};

/** The UI page: scripts and styles only from separate files on this server. */
export const UI_PAGE_CSP = "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Reports and comparisons: inline styles and screenshot images, no scripts at all (they show text from scanned sites). */
export const REPORT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; media-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function createSessionToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Named per port: browsers send a 127.0.0.1 cookie to every port on that host. */
export function tokenCookieName(port: number): string {
  return `blindfold_ui_token_${port}`;
}

/** Sent with the UI page, so report links (and the audio inside reports) work without the token in their URL. */
export function tokenCookie(port: number, token: string): string {
  return `${tokenCookieName(port)}=${token}; HttpOnly; SameSite=Strict; Path=/`;
}

export function tokensMatch(expected: string, given: string | null | undefined): boolean {
  if (!given) return false;
  const expectedBytes = Buffer.from(expected);
  const givenBytes = Buffer.from(given);
  return expectedBytes.length === givenBytes.length && timingSafeEqual(expectedBytes, givenBytes);
}

/** Only our own address: a DNS-rebinding page would send its own host name. */
export function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  return hostHeader === `127.0.0.1:${port}` || hostHeader === `localhost:${port}`;
}

/** Browsers send Origin with POSTs; it must be ours. No Origin means a non-browser client (tests, curl). */
export function isAllowedOrigin(originHeader: string | undefined, port: number): boolean {
  return originHeader === undefined || originHeader === `http://127.0.0.1:${port}` || originHeader === `http://localhost:${port}`;
}

export function readHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function readCookie(request: IncomingMessage, name: string): string | null {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}
