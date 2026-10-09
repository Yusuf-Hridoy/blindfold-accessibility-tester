import { describe, expect, it } from "vitest";
import { buildJobSummary, escapeMarkdownCell } from "../../src/action/job-summary-builder.ts";
import type { ReportComparison } from "../../src/compare/report-comparison.ts";
import type { JourneyResult } from "../../src/types/journey-result-types.ts";
import type { Finding, ScanResult } from "../../src/types/scan-result-types.ts";

function finding(fields: Partial<Finding> & Pick<Finding, "ruleId" | "description">): Finding {
  return { elementId: 1, selector: "#x", step: null, transcriptExcerpt: [], ...fields };
}

function scan(findings: Finding[]): ScanResult {
  return { url: "http://shop.example/cart.html", findings } as ScanResult;
}

/** The table rows (lines starting with "|") must all have the same number of unescaped pipes. */
function cellCounts(markdown: string): number[] {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => line.replace(/\\\|/g, "").split("|").length);
}

describe("escapeMarkdownCell", () => {
  it("neutralises pipes, backticks, HTML, links, emphasis and line breaks", () => {
    expect(escapeMarkdownCell("a | b")).toBe("a \\| b");
    expect(escapeMarkdownCell("`code`")).toBe("\\`code\\`");
    expect(escapeMarkdownCell("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
    expect(escapeMarkdownCell("[click](http://evil.example)")).toBe("\\[click\\](http://evil.example)");
    expect(escapeMarkdownCell("**strong** _em_")).toBe("\\*\\*strong\\*\\* \\_em\\_");
    expect(escapeMarkdownCell("line one\nline two\r\nthree")).toBe("line one line two three");
    expect(escapeMarkdownCell("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });
});

describe("buildJobSummary", () => {
  it("keeps the findings table intact for a hostile element name", () => {
    const hostile = 'button.x "Buy | now`</td><script>alert(1)</script>\n| injected | row |"';
    const summary = buildJobSummary({
      report: scan([finding({ ruleId: "BF-002", reason: "missing-name", description: hostile }), finding({ ruleId: "BF-004", description: "a.nav-link" })]),
      comparison: null,
      exitCode: 1,
      artifactName: "blindfold-results",
    });
    expect(summary).not.toContain("<script>");
    expect(summary).not.toContain("</td>");
    expect(summary).not.toMatch(/(^|[^\\])`/);
    expect(summary).not.toContain("\n| injected");
    // Header, separator and two rows, each with the same number of cells.
    const counts = cellCounts(summary);
    expect(counts).toHaveLength(4);
    expect(new Set(counts).size).toBe(1);
  });

  it("gives the verdict, the findings with WCAG, and where the full report is", () => {
    const summary = buildJobSummary({
      report: scan([finding({ ruleId: "BF-001", description: 'div.checkout-button "Checkout"' })]),
      comparison: null,
      exitCode: 1,
      artifactName: "blindfold-buggy-cart-scan",
    });
    expect(summary).toContain("❌ **1 barrier found** · http://shop.example/cart.html");
    expect(summary).toContain("| BF-001 | Control can't be reached by keyboard | div.checkout-button \"Checkout\" | 2.1.1 Keyboard (Level A) |");
    expect(summary).toContain("is in the **blindfold-buggy-cart-scan** artifact");
  });

  it("shows effort for journeys and comparison totals with a baseline", () => {
    const journey = {
      journeyName: "Cart",
      outcome: "blocked",
      blockedAtStep: 2,
      barrierCount: 1,
      findings: [finding({ ruleId: "BF-001", description: "div.checkout-button", journeyStep: 2 })],
      effort: { keyboardPresses: 19, mouseClicks: 2, ratio: 9.5, untilBlocked: true, perStep: [] },
    } as unknown as JourneyResult;
    const comparison = {
      totals: { fixed: 3, new: 1, stillPresent: 4 },
      warnings: [],
      journey: { summary: "passed, now blocked at step 2" },
      new: [{ ruleId: "BF-001", summary: "Control can't be reached by keyboard: div.checkout-button", wcag: "2.1.1 Keyboard (Level A)" }],
    } as unknown as ReportComparison;
    const summary = buildJobSummary({ report: journey, comparison, exitCode: 1, artifactName: "blindfold-results" });
    expect(summary).toContain("❌ **Journey blocked at step 2** · journey: Cart");
    expect(summary).toContain("Effort: a keyboard user needed 19 keys vs 2 clicks (9.5×), until blocked.");
    expect(summary).toContain("| 2 | BF-001 |");
    expect(summary).toContain("✓ 3 fixed · ✗ 1 new · • 4 still present");
    expect(summary).toContain("Journey passed, now blocked at step 2.");
    expect(summary).toContain("comparison.html");
  });

  it("says Blindfold couldn't complete when it exited 2", () => {
    const summary = buildJobSummary({ report: null, comparison: null, exitCode: 2, artifactName: "blindfold-results" });
    expect(summary).toContain("⚠️ **Blindfold couldn't complete.** See the step's log for the reason.");
  });
});
