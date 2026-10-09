import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ScanFailedError } from "../../src/scan/page-scanner.ts";
import { recordLoginSession } from "../../src/sessions/login-session-recorder.ts";
import { findSessionProblem, loadSessionFile, SessionFileError } from "../../src/sessions/session-file-loader.ts";
import { startSnippetScanner, type SnippetScanner } from "../helpers/scan-html-snippet.ts";

const LOGIN_COOKIE = { name: "pebble-login", value: "signed-in" };

let scanner: SnippetScanner;
let folder: string;

beforeAll(async () => {
  scanner = await startSnippetScanner();
  folder = await mkdtemp(path.join(os.tmpdir(), "blindfold-session-test-"));
});

afterAll(async () => {
  await scanner.close();
  await rm(folder, { recursive: true, force: true });
});

async function writeSessionFile(name: string, content: string): Promise<string> {
  const filePath = path.join(folder, name);
  await writeFile(filePath, content);
  return filePath;
}

describe("checking a session file", () => {
  it("accepts Playwright storage state", () => {
    expect(findSessionProblem({ cookies: [], origins: [] })).toBeNull();
    expect(
      findSessionProblem({
        cookies: [{ name: "a", value: "b", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }],
        origins: [{ origin: "http://localhost", localStorage: [{ name: "k", value: "v" }] }],
      }),
    ).toBeNull();
  });

  it("names what's wrong with anything else", () => {
    expect(findSessionProblem([])).toBe("it isn't a JSON object");
    expect(findSessionProblem({ origins: [] })).toBe('it has no "cookies" list');
    expect(findSessionProblem({ cookies: [] })).toBe('it has no "origins" list');
    expect(findSessionProblem({ cookies: [{ name: "a" }], origins: [] })).toBe("one of its cookies is missing a name, value, domain or path");
  });

  it("a missing file is a SessionFileError that says how to create one", async () => {
    const missing = path.join(folder, "missing.session.json");
    await expect(loadSessionFile(missing)).rejects.toThrow(SessionFileError);
    await expect(loadSessionFile(missing)).rejects.toThrow(`Session file not found: ${missing}. Create one with: npm run blindfold -- login <url> --save-session missing.session.json`);
  });

  it("invalid JSON and the wrong shape are SessionFileErrors", async () => {
    const notJson = await writeSessionFile("not-json.session.json", "{ cookies: ");
    await expect(loadSessionFile(notJson)).rejects.toThrow("isn't valid JSON");
    const wrongShape = await writeSessionFile("wrong.session.json", JSON.stringify({ cookies: "yes" }));
    await expect(loadSessionFile(wrongShape)).rejects.toThrow('isn\'t a saved session (it has no "cookies" list)');
  });
});

const protectedUrl = () => scanner.protectedPageUrl(`<h1>Your account</h1><button>Sign out</button>`, LOGIN_COOKIE);

describe("scanning a logged-in page", () => {
  it("without a session, the page answers 401 and the scan can't complete", async () => {
    await expect(scanner.scanUrl(protectedUrl())).rejects.toThrow(ScanFailedError);
    await expect(scanner.scanUrl(protectedUrl())).rejects.toThrow("returned HTTP 401");
  });

  it("with a session file holding the login cookie, the scan succeeds", async () => {
    const sessionFile = await writeSessionFile(
      "shop.session.json",
      JSON.stringify({
        cookies: [{ ...LOGIN_COOKIE, domain: "localhost", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
        origins: [],
      }),
    );
    const outcome = await scanner.scanUrl(protectedUrl(), { session: await loadSessionFile(sessionFile) });
    expect(outcome.result.focusStops.map((stop) => stop.accessibleName)).toEqual(["Sign out"]);
    expect(outcome.result.findings).toEqual([]);
  });
});

describe("saving a login (the headed window itself is checked by hand)", () => {
  it("saves the cookies set while the window was open, readable only by the owner", async () => {
    const loginPage = scanner.pageUrl(`<h1>Log in</h1><script>document.cookie = "${LOGIN_COOKIE.name}=${LOGIN_COOKIE.value}; path=/";</script>`);
    const sessionFile = path.join(folder, "recorded.session.json");
    // Headless stand-in for the user: the page sets the cookie, then the "window" is closed.
    const saved = await recordLoginSession(loginPage, sessionFile, () => chromium.launch({ headless: true }), (page) => page.close());
    expect(saved.cookieCount).toBe(1);
    expect((await stat(sessionFile)).mode & 0o777).toBe(0o600);

    const session = await loadSessionFile(sessionFile);
    expect(session.cookies.map((cookie) => [cookie.name, cookie.value])).toEqual([[LOGIN_COOKIE.name, LOGIN_COOKIE.value]]);
    const outcome = await scanner.scanUrl(protectedUrl(), { session });
    expect(outcome.result.focusStops).toHaveLength(1);
  });
});
