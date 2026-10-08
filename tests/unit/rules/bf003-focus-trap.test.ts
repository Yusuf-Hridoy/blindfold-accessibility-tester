import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findingSelectors, startSnippetScanner, type SnippetScanner } from "../../helpers/scan-html-snippet.ts";

const TRAP_PAGE = `
  <a href="#start">Start</a>
  <div id="box"><input id="email" aria-label="Email"><button id="join">Join</button></div>
  <a href="#end">End</a>
  <script>
    document.getElementById("box").addEventListener("keydown", (event) => {
      if (event.key === "Tab" && !event.shiftKey && document.activeElement.id === "join") {
        event.preventDefault();
        document.getElementById("email").focus();
      }
    });
  </script>`;

/**
 * Focus starts on "One" inside a container whose script loops Tab from "Two"
 * back to "One", so focus never reaches the end of the page.
 */
function modalPage(options: { dialogAttributes: string; pageInert: boolean }): string {
  return `
    <main ${options.pageInert ? "inert" : ""}><a href="#outside">Outside link</a></main>
    <div id="modal" ${options.dialogAttributes}>
      <button id="one">One</button><button id="two">Two</button>
    </div>
    <script>
      document.getElementById("modal").addEventListener("keydown", (event) => {
        if (event.key === "Tab" && !event.shiftKey && document.activeElement.id === "two") {
          event.preventDefault();
          document.getElementById("one").focus();
        }
      });
      document.getElementById("one").focus();
    </script>`;
}

describe("BF-003 focus trap", () => {
  let scanner: SnippetScanner;

  beforeAll(async () => {
    scanner = await startSnippetScanner();
  });

  afterAll(async () => {
    await scanner.close();
  });

  it("fires for a two-element trap", async () => {
    const outcome = await scanner.scan(`
      <a href="#start">Start</a>
      <div id="box"><input id="email" aria-label="Email"><button id="join">Join</button></div>
      <a href="#end">End</a>
      <script>
        document.getElementById("box").addEventListener("keydown", (event) => {
          if (event.key === "Tab" && !event.shiftKey && document.activeElement.id === "join") {
            event.preventDefault();
            document.getElementById("email").focus();
          }
        });
      </script>`);
    expect(outcome.result.stoppedBecause).toBe("focus-trap");
    expect(findingSelectors(outcome, "BF-003")).toEqual(["#email"]);
    const finding = outcome.result.findings.find((candidate) => candidate.ruleId === "BF-003");
    expect(finding?.trapCycle?.map((element) => element.selector)).toEqual(["#email", "#join"]);
    expect(finding?.step).toBe(2);
  });

  it("fires in a journey whose step starts inside the trap, anchored on the earliest element, with no BF-001", async () => {
    const outcome = await scanner.runJourney(TRAP_PAGE, [
      { reach: "Email, textbox", type: "ada@example.com" },
      { reach: "Start, link", press: "Enter" },
    ]);
    expect(outcome.result.blockedAtStep).toBe(2);
    expect(findingSelectors(outcome, "BF-003")).toEqual(["#email"]);
    const trap = outcome.result.findings.find((finding) => finding.ruleId === "BF-003");
    expect(trap?.trapCycle?.map((element) => element.selector)).toEqual(["#email", "#join"]);
    expect(findingSelectors(outcome, "BF-001")).toEqual([]);
  });

  describe("a step that starts inside legitimately confined focus gives \"never reached\", no BF-003, no BF-001", () => {
    it.each([
      ["an aria-modal dialog with the page inert", modalPage({ dialogAttributes: 'role="dialog" aria-modal="true" aria-label="Help"', pageInert: true })],
      ["an aria-modal dialog with a scripted Tab loop and no inert background", modalPage({ dialogAttributes: 'role="dialog" aria-modal="true" aria-label="Help"', pageInert: false })],
      ["a plain container when everything else is inert", modalPage({ dialogAttributes: 'class="panel"', pageInert: true })],
    ])("%s", async (_label, html) => {
      const outcome = await scanner.runJourney(html, [{ reach: "Outside link, link", press: "Enter" }]);
      expect(outcome.result.blockedAtStep).toBe(1);
      expect(outcome.result.steps[0]?.blockedBecause).toMatch(/never reached/);
      expect(findingSelectors(outcome, "BF-003")).toEqual([]);
      expect(findingSelectors(outcome, "BF-001")).toEqual([]);
    });

    it("a <dialog> opened with showModal()", async () => {
      const outcome = await scanner.runJourney(
        `<a href="#outside">Outside link</a>
        <dialog id="help" aria-label="Help"><button id="one">One</button><button id="two">Two</button></dialog>
        <script>document.getElementById("help").showModal(); document.getElementById("one").focus();</script>`,
        [{ reach: "Outside link, link", press: "Enter" }],
      );
      expect(outcome.result.blockedAtStep).toBe(1);
      expect(findingSelectors(outcome, "BF-003")).toEqual([]);
      expect(findingSelectors(outcome, "BF-001")).toEqual([]);
    });
  });

  it("does not fire when focus simply wraps back to the first stop", async () => {
    const outcome = await scanner.scan(`<a href="#one">One</a><button>Two</button><button>Three</button>`);
    expect(["end-of-page", "cycle-complete"]).toContain(outcome.result.stoppedBecause);
    expect(findingSelectors(outcome, "BF-003")).toEqual([]);
  });
});
