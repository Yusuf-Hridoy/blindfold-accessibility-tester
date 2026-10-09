import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ScanFailedError } from "../../src/scan/page-scanner.ts";
import { startSnippetScanner, type SnippetScanner } from "../helpers/scan-html-snippet.ts";

let scanner: SnippetScanner;

beforeAll(async () => {
  scanner = await startSnippetScanner();
});

afterAll(async () => {
  await scanner.close();
});

function pageWithHelpLink(): { page: string; helpUrl: string } {
  const helpUrl = scanner.pageUrl(`<h1>Help centre</h1><button>Contact us</button>`);
  return { page: `<a href="${helpUrl}" target="_blank">Help</a><button>Stay here</button>`, helpUrl };
}

describe("a link that opens a new tab", () => {
  it("with follow_new_tab, the journey continues in the new tab", async () => {
    const { page, helpUrl } = pageWithHelpLink();
    const { result } = await scanner.runJourney(page, [
      { reach: "Help, link", press: "Enter", followNewTab: true },
      { reach: "Contact us, button", press: "Enter" },
    ]);
    expect(result.outcome).toBe("passed");
    expect(result.steps[0]?.openedNewTab).toBe(helpUrl);
    expect(result.steps[0]?.navigatedTo).toBeUndefined();
    expect(result.finalUrl).toBe(helpUrl);
    expect(result.transcript.filter((entry) => entry.kind === "page").map((entry) => [entry.openedBy, entry.url])).toEqual([
      ["start", expect.any(String)],
      ["new-tab", helpUrl],
    ]);
    expect(result.transcript.some((entry) => entry.kind === "note" && entry.text === `Opened a new tab: ${helpUrl}. The journey continues there.`)).toBe(true);
  });

  it("without follow_new_tab, the tab is recorded and closed, and the journey stays on the page", async () => {
    const { page, helpUrl } = pageWithHelpLink();
    const { result } = await scanner.runJourney(page, [
      { reach: "Help, link", press: "Enter" },
      { reach: "Stay here, button", press: "Enter" },
    ]);
    expect(result.outcome).toBe("passed");
    expect(result.steps[0]?.openedNewTab).toBe(helpUrl);
    expect(result.finalUrl).toBe(result.startUrl);
    expect(result.transcript.some((entry) => entry.kind === "note" && entry.text.endsWith("The journey stays on this page; the tab was closed."))).toBe(true);
  });

  it("follow_new_tab when no tab opens is an expectation failure", async () => {
    const { result } = await scanner.runJourney(`<button>Nothing</button>`, [{ reach: "Nothing, button", press: "Enter", followNewTab: true }]);
    expect(result.outcome).toBe("completed-with-barriers");
    expect(result.steps[0]?.expectationFailures).toEqual([{ expectation: "follow_new_tab", message: "expected a new tab to open" }]);
  });

  it("a followed tab that doesn't load successfully stops the journey with a clear error", async () => {
    const run = scanner.runJourney(`<a href="${scanner.origin}/missing.html" target="_blank">Broken</a>`, [
      { reach: "Broken, link", press: "Enter", followNewTab: true },
    ]);
    await expect(run).rejects.toThrow(ScanFailedError);
    await expect(run).rejects.toThrow("returned HTTP 404");
  });
});
