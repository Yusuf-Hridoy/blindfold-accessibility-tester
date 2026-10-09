import { describe, expect, it } from "vitest";
import { JourneyFileError, parseJourneyFile } from "../../src/journeys/journey-file-schema.ts";

function problemsFor(text: string): string[] {
  try {
    parseJourneyFile(text, "checkout.yaml");
  } catch (error) {
    if (error instanceof JourneyFileError) return error.message.split("\n");
    throw error;
  }
  throw new Error("expected the file to be rejected");
}

describe("parseJourneyFile", () => {
  it("accepts a valid file", () => {
    const journey = parseJourneyFile(
      [
        "name: Product to checkout",
        "start_url: /product.html",
        "steps:",
        '  - reach: "Add to cart, button"',
        "    press: Enter",
        '    expect_announcement: "added to cart"',
        "  - press: Escape",
        '    expect_closed: "Size guide"',
        '  - type: "ada@example.com"',
        '  - dismiss: "Accept, button"',
        '    expect_url_contains: "/checkout"',
      ].join("\n"),
      "checkout.yaml",
    );
    expect(journey.name).toBe("Product to checkout");
    expect(journey.startUrl).toBe("/product.html");
    expect(journey.steps).toEqual([
      { line: 4, reach: "Add to cart, button", press: "Enter", expectAnnouncement: "added to cart" },
      { line: 7, press: "Escape", expectClosed: "Size guide" },
      { line: 9, type: "ada@example.com" },
      { line: 10, dismiss: "Accept, button", expectUrlContains: "/checkout" },
    ]);
  });

  it("rejects a file without steps", () => {
    expect(problemsFor("name: Empty\nstart_url: /")).toEqual([
      expect.stringMatching(/^checkout\.yaml line 1: missing "steps"/),
    ]);
  });

  it("names the line and field of an unknown field, with a suggestion", () => {
    const problems = problemsFor(
      ["name: Typo", "start_url: /", "steps:", '  - reach: "Add, button"', "    press: Enter", '    expect_anouncement: "added"'].join("\n"),
    );
    expect(problems).toEqual([
      'checkout.yaml line 6: step 1 has an unknown field "expect_anouncement". Did you mean "expect_announcement"?',
    ]);
  });

  it("rejects a reach with nothing to do", () => {
    const problems = problemsFor(
      ["name: Idle", "start_url: /", "steps:", "  - press: Tab", '  - reach: "Checkout, button"'].join("\n"),
    );
    expect(problems).toEqual([
      'checkout.yaml line 5: step 2 has "reach" but no "press" and no "expect_*". Add a key to press.',
    ]);
  });

  it("rejects a key name that isn't supported", () => {
    const problems = problemsFor(["name: Keys", "start_url: /", "steps:", '  - reach: "Save, button"', "    press: Return"].join("\n"));
    expect(problems[0]).toMatch(/^checkout\.yaml line 5: step 1 "press" is "Return", which isn't a supported key\. Use one of: Enter, Space/);
  });

  it("rejects dismiss combined with reach", () => {
    const problems = problemsFor(["name: Both", "start_url: /", "steps:", '  - dismiss: "Accept, button"', '    reach: "Accept, button"'].join("\n"));
    expect(problems[0]).toMatch(/line 4: step 1 has "dismiss" together with "reach"/);
  });

  it("reports YAML syntax errors with a line number", () => {
    const problems = problemsFor(["name: Broken", "start_url: /", "steps:", '  - reach: "unclosed'].join("\n"));
    expect(problems[0]).toMatch(/^checkout\.yaml line \d+: this isn't valid YAML/);
  });

  it("accepts a viewport and follow_new_tab", () => {
    const journey = parseJourneyFile(
      ["name: Help", "start_url: /", "viewport: mobile", "steps:", '  - reach: "Help, link"', "    press: Enter", "    follow_new_tab: true"].join("\n"),
      "help.yaml",
    );
    expect(journey.viewport).toBe("mobile");
    expect(journey.steps).toEqual([{ line: 5, reach: "Help, link", press: "Enter", followNewTab: true }]);
  });

  it("leaves the viewport unset when the file doesn't choose one", () => {
    const journey = parseJourneyFile(["name: Help", "start_url: /", "steps:", "  - press: Enter"].join("\n"), "help.yaml");
    expect(journey.viewport).toBeUndefined();
  });

  it("rejects an unknown viewport and a follow_new_tab that isn't true or false", () => {
    expect(problemsFor(["name: Help", "start_url: /", "viewport: tablet", "steps:", "  - press: Enter"].join("\n"))).toEqual([
      'checkout.yaml line 3: "viewport" is "tablet". Use one of: desktop, mobile.',
    ]);
    expect(problemsFor(["name: Help", "start_url: /", "steps:", "  - press: Enter", '    follow_new_tab: "yes"'].join("\n"))).toEqual([
      'checkout.yaml line 5: step 1 "follow_new_tab" must be true or false, e.g. follow_new_tab: true.',
    ]);
  });

  it("rejects follow_new_tab on a step without an action that could open a tab", () => {
    expect(problemsFor(["name: Help", "start_url: /", "steps:", '  - type: "hello"', "    follow_new_tab: true"].join("\n"))).toEqual([
      'checkout.yaml line 4: step 1 has "follow_new_tab" but no "press" or "dismiss". A new tab only opens after an action.',
    ]);
  });
});
