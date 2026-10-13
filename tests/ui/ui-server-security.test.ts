// The web UI's security rules: session token, Host check (DNS rebinding),
// no CORS, results-folder confinement, input checks and one run at a time.

import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDemoSiteServer, type RunningDemoSiteServer } from "../../demo-sites/serve-demo-sites.ts";
import { tokenCookieName } from "../../src/ui/ui-request-security.ts";
import type { RunningUiServer } from "../../src/ui/ui-server.ts";
import { apiCall, startRun, startTestUiServer, tokenHeader, uiRequest, type UiResponse } from "../helpers/ui-test-client.ts";

let server: RunningUiServer;
let resultsFolder: string;
let demoShop: RunningDemoSiteServer;

beforeAll(async () => {
  ({ server, resultsFolder } = await startTestUiServer());
  demoShop = await startDemoSiteServer({ shop: "buggy", port: 0 });
  // A run folder, and a file just outside the results folder that must never be served.
  await mkdir(path.join(resultsFolder, "2026-10-13-120000-example"));
  await writeFile(path.join(resultsFolder, "2026-10-13-120000-example", "report.json"), "{}");
  await writeFile(path.join(resultsFolder, "..", `${path.basename(resultsFolder)}-secret.json`), '{"secret":true}');
  await symlink(path.join(import.meta.dirname, "..", "..", "package.json"), path.join(resultsFolder, "2026-10-13-120000-example", "linked.json"));
});

afterAll(async () => {
  await server.close();
  await demoShop.close();
  await rm(path.join(resultsFolder, "..", `${path.basename(resultsFolder)}-secret.json`), { force: true });
  await rm(resultsFolder, { recursive: true, force: true });
});

function errorOf(response: UiResponse): { error: string; field?: string } {
  return JSON.parse(response.body) as { error: string; field?: string };
}

describe("session token", () => {
  it("refuses API calls without a token or with a wrong one (403), and accepts the right one", async () => {
    expect((await uiRequest(server.port, { path: "/api/history" })).status).toBe(403);
    expect((await uiRequest(server.port, { path: "/api/history", headers: tokenHeader("wrong-token") })).status).toBe(403);
    expect((await uiRequest(server.port, { path: "/api/history", headers: tokenHeader(`${server.token}x`) })).status).toBe(403);
    expect((await apiCall(server, "GET", "/api/history")).status).toBe(200);
  });

  it("refuses POSTs without the token, even with the token in the URL", async () => {
    const body = { url: `${demoShop.url}/cart.html`, viewport: "desktop", audio: false };
    expect((await uiRequest(server.port, { method: "POST", path: "/api/scans", body })).status).toBe(403);
    expect((await uiRequest(server.port, { method: "POST", path: `/api/scans?token=${server.token}`, body })).status).toBe(403);
  });

  it("serves the page only with the token, with a strict CSP and an HttpOnly SameSite=Strict cookie", async () => {
    expect((await uiRequest(server.port, { path: "/" })).status).toBe(403);
    expect((await uiRequest(server.port, { path: "/?token=wrong" })).status).toBe(403);
    const page = await uiRequest(server.port, { path: `/?token=${server.token}` });
    expect(page.status).toBe(200);
    expect(page.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(page.headers["referrer-policy"]).toBe("no-referrer");
    expect(page.headers["set-cookie"]?.[0]).toMatch(/HttpOnly; SameSite=Strict/);
  });

  it("refuses result files without the token (cookie or ?token=)", async () => {
    const filePath = "/results/2026-10-13-120000-example/report.json";
    expect((await uiRequest(server.port, { path: filePath })).status).toBe(403);
    const withQuery = await uiRequest(server.port, { path: `${filePath}?token=${server.token}` });
    expect(withQuery.status).toBe(200);
    expect(withQuery.headers["content-type"]).toBe("application/json; charset=utf-8");
    const withCookie = await uiRequest(server.port, { path: filePath, headers: { Cookie: `${tokenCookieName(server.port)}=${server.token}` } });
    expect(withCookie.status).toBe(200);
  });
});

describe("Host header (DNS rebinding)", () => {
  it("refuses any Host other than 127.0.0.1:<port> or localhost:<port>, even with the right token", async () => {
    for (const host of ["evil.example", `evil.example:${server.port}`, `127.0.0.1:${server.port + 1}`, "127.0.0.1", `0.0.0.0:${server.port}`]) {
      const response = await uiRequest(server.port, { path: "/api/history", headers: { ...tokenHeader(server.token), Host: host } });
      expect(response.status, host).toBe(403);
    }
    const localhost = await uiRequest(server.port, { path: "/api/history", headers: { ...tokenHeader(server.token), Host: `localhost:${server.port}` } });
    expect(localhost.status).toBe(200);
  });
});

describe("cross-origin requests", () => {
  it("never sends CORS headers, not even to a preflight", async () => {
    const origin = { Origin: "https://evil.example" };
    const responses = [
      await uiRequest(server.port, { method: "OPTIONS", path: "/api/scans", headers: { ...origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-blindfold-token" } }),
      await uiRequest(server.port, { path: "/api/history", headers: { ...origin, ...tokenHeader(server.token) } }),
      await uiRequest(server.port, { path: `/?token=${server.token}`, headers: origin }),
      await uiRequest(server.port, { path: "/blindfold-ui.js", headers: origin }),
    ];
    for (const response of responses) {
      expect(Object.keys(response.headers).filter((name) => name.startsWith("access-control-"))).toEqual([]);
    }
  });

  it("refuses POSTs from another origin (403)", async () => {
    const response = await uiRequest(server.port, {
      method: "POST",
      path: "/api/scans",
      headers: { ...tokenHeader(server.token), Origin: "https://evil.example" },
      body: { url: `${demoShop.url}/cart.html`, viewport: "desktop", audio: false },
    });
    expect(response.status).toBe(403);
  });
});

describe("result files", () => {
  it("never serves anything outside the results folder (404)", async () => {
    const cookie = { Cookie: `${tokenCookieName(server.port)}=${server.token}` };
    const secret = `${path.basename(resultsFolder)}-secret.json`;
    const attempts = [
      "/results/../package.json",
      "/results/..%2f..%2fpackage.json",
      "/results/%2e%2e/%2e%2e/package.json",
      `/results/..%2f${secret}`,
      `/results/2026-10-13-120000-example/..%2f..%2f${secret}`,
      "/results/2026-10-13-120000-example/..%5c..%5cpackage.json",
      "/results/%2e%2e%2f%2e%2e%2fpackage.json",
      "/results/2026-10-13-120000-example/linked.json",
      "/results/%00",
    ];
    for (const attempt of attempts) {
      const response = await uiRequest(server.port, { path: attempt, headers: cookie });
      expect(response.status, attempt).toBe(404);
      expect(response.body, attempt).not.toContain('"secret"');
      expect(response.body, attempt).not.toContain('"name": "blindfold-a11y"');
    }
  });
});

describe("input checks", () => {
  it("only scans http: and https: URLs (400, next to the URL field)", async () => {
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi", "ftp://example.com/", "not a url", ""]) {
      const response = await apiCall(server, "POST", "/api/scans", { url, viewport: "desktop", audio: false });
      expect(response.status, url).toBe(400);
      expect(errorOf(response).field, url).toBe("url");
    }
    const badViewport = await apiCall(server, "POST", "/api/scans", { url: `${demoShop.url}/`, viewport: "tablet", audio: false });
    expect(badViewport.status).toBe(400);
  });

  it("only runs journey files inside the journeys folder (400)", async () => {
    for (const file of ["../package.json", "../example-journeys/buggy-shop-cart-journey.yaml", "/etc/passwd", "..\\package.yaml", "missing.yaml", "", 42]) {
      const response = await apiCall(server, "POST", "/api/journeys", { file, baseUrl: demoShop.url, audio: false });
      expect(response.status, String(file)).toBe(400);
      expect(errorOf(response).field, String(file)).toBe("file");
    }
  });

  it("only accepts an http(s) base URL, and asks for one when start_url is a path (400)", async () => {
    const javascript = await apiCall(server, "POST", "/api/journeys", { file: "buggy-shop-cart-journey.yaml", baseUrl: "javascript:alert(1)", audio: false });
    expect(javascript.status).toBe(400);
    expect(errorOf(javascript).field).toBe("baseUrl");
    const missing = await apiCall(server, "POST", "/api/journeys", { file: "buggy-shop-cart-journey.yaml", baseUrl: "", audio: false });
    expect(missing.status).toBe(400);
    expect(errorOf(missing)).toEqual({ field: "baseUrl", error: expect.stringContaining("enter the site's base URL") });
  });

  it("refuses invalid JSON and unknown runs", async () => {
    const invalid = await uiRequest(server.port, { method: "POST", path: "/api/scans", headers: tokenHeader(server.token), rawBody: "{not json" });
    expect(invalid.status).toBe(400);
    expect(errorOf(invalid).error).toMatch(/valid JSON/);
    expect((await apiCall(server, "POST", "/api/runs/nope/cancel")).status).toBe(404);
    expect((await apiCall(server, "GET", "/api/runs/nope/events")).status).toBe(404);
  });
});

describe("one run at a time", () => {
  it("refuses a second scan or journey while one is running (409), then cancels the first", async () => {
    const first = await startRun(server, "/api/scans", { url: `${demoShop.url}/index.html?no-cookie-banner=1`, viewport: "desktop", audio: false });
    try {
      const secondScan = await apiCall(server, "POST", "/api/scans", { url: `${demoShop.url}/cart.html`, viewport: "desktop", audio: false });
      expect(secondScan.status).toBe(409);
      expect(errorOf(secondScan).error).toMatch(/already in progress/);
      const journey = await apiCall(server, "POST", "/api/journeys", { file: "buggy-shop-cart-journey.yaml", baseUrl: demoShop.url, audio: false });
      expect(journey.status).toBe(409);
    } finally {
      await apiCall(server, "POST", `/api/runs/${first.runId}/cancel`);
      await first.events.waitForEnd();
    }
  });
});
