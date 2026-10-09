import { describe, expect, it } from "vitest";
import { buildComparisonHtml } from "../../src/compare/comparison-report-builder.ts";
import {
  compareReports,
  ComparisonError,
  identifyReport,
  matchFindings,
  type ComparedFinding,
  type LoadedReport,
} from "../../src/compare/report-comparison.ts";
import type { JourneyResult } from "../../src/types/journey-result-types.ts";
import type { Finding, ScanResult } from "../../src/types/scan-result-types.ts";

function compared(fields: Partial<ComparedFinding> & Pick<ComparedFinding, "ruleId" | "selector">): ComparedFinding {
  return { description: fields.selector, accessibleName: "", wcag: "", summary: "", ...fields };
}

function finding(fields: Partial<Finding> & Pick<Finding, "ruleId" | "selector">): Finding {
  return { elementId: 1, description: fields.selector, step: null, transcriptExcerpt: [], ...fields };
}

function scanReport(url: string, findings: Finding[], extra: Partial<ScanResult> = {}): LoadedReport {
  const result = { toolVersion: "0.4.0", url, scannedAt: "2026-10-09T10:00:00.000Z", focusStops: [], mousePassElements: [], findings, ...extra };
  return identifyReport(result, "/reports/report.json");
}

function journeyReport(fields: Partial<JourneyResult>): LoadedReport {
  const result = {
    toolVersion: "0.4.0",
    journeyName: "Cart, remove an item and check out",
    scannedAt: "2026-10-09T10:00:00.000Z",
    steps: [],
    findings: [],
    outcome: "passed",
    blockedAtStep: null,
    barrierCount: 0,
    effort: { keyboardPresses: 11, mouseClicks: 2, ratio: 5.5, untilBlocked: false, perStep: [] },
    ...fields,
  };
  return identifyReport(result, "/reports/journey.json");
}

describe("matching findings", () => {
  it("matches exactly by rule, reason and selector", () => {
    const old = [compared({ ruleId: "BF-004", selector: "a.nav-link" }), compared({ ruleId: "BF-001", selector: "#checkout" })];
    const current = [compared({ ruleId: "BF-004", selector: "a.nav-link" })];
    const result = matchFindings(old, current);
    expect(result.stillPresent).toEqual([{ old: old[0], new: current[0], matchedBy: "selector" }]);
    expect(result.fixed).toEqual([old[1]]);
    expect(result.new).toEqual([]);
  });

  it("falls back to description and accessible name when the selector changed", () => {
    const old = [compared({ ruleId: "BF-002", reason: "missing-name", selector: "header > button:nth-of-type(2)", description: "button.cart-button" })];
    const current = [compared({ ruleId: "BF-002", reason: "missing-name", selector: "#cart", description: "button.cart-button" })];
    const result = matchFindings(old, current);
    expect(result.stillPresent).toEqual([{ old: old[0], new: current[0], matchedBy: "description" }]);
    expect(result.fixed).toEqual([]);
    expect(result.new).toEqual([]);
  });

  it("doesn't match on description when the accessible name differs", () => {
    const old = [compared({ ruleId: "BF-004", selector: "#a", description: "a.nav-link", accessibleName: "Shop" })];
    const current = [compared({ ruleId: "BF-004", selector: "#b", description: "a.nav-link", accessibleName: "Cart" })];
    const result = matchFindings(old, current);
    expect(result.fixed).toHaveLength(1);
    expect(result.new).toHaveLength(1);
  });

  it("a BF-002 whose reason changed is one fixed and one new (the fix is different)", () => {
    const old = [compared({ ruleId: "BF-002", reason: "missing-name", selector: "#menu" })];
    const current = [compared({ ruleId: "BF-002", reason: "hidden-from-screen-readers", selector: "#menu" })];
    const result = matchFindings(old, current);
    expect(result.fixed).toEqual(old);
    expect(result.new).toEqual(current);
    expect(result.stillPresent).toEqual([]);
  });

  it("matches duplicates one to one", () => {
    const old = [compared({ ruleId: "BF-004", selector: "#x" })];
    const current = [compared({ ruleId: "BF-004", selector: "#x" }), compared({ ruleId: "BF-004", selector: "#x" })];
    const result = matchFindings(old, current);
    expect(result.stillPresent).toHaveLength(1);
    expect(result.new).toHaveLength(1);
  });
});

describe("compareReports", () => {
  it("uses accessible names recorded in scan reports for the fallback match", () => {
    const old = scanReport("http://shop.example/", [finding({ ruleId: "BF-004", selector: "#old", description: "a.nav-link", elementId: 5 })], {
      focusStops: [{ elementId: 5, accessibleName: "Shop" }] as ScanResult["focusStops"],
    });
    const current = scanReport("http://shop.example/", [finding({ ruleId: "BF-004", selector: "#new", description: "a.nav-link", elementId: 9 })], {
      focusStops: [{ elementId: 9, accessibleName: "Shop" }] as ScanResult["focusStops"],
    });
    const comparison = compareReports(old, current, "0.4.0");
    expect(comparison.totals).toEqual({ fixed: 0, new: 0, stillPresent: 1 });
    expect(comparison.stillPresent[0]?.matchedBy).toBe("description");
    expect(comparison.warnings).toEqual([]);
  });

  it("warns when the reports are for different pages, and compares anyway", () => {
    const comparison = compareReports(scanReport("http://a.example/", []), scanReport("http://b.example/", []), "0.4.0");
    expect(comparison.warnings).toEqual(['The reports are for different pages: "http://a.example/" and "http://b.example/". Comparing anyway.']);
  });

  it("can't compare a scan report with a journey report", () => {
    expect(() => compareReports(scanReport("http://a.example/", []), journeyReport({}), "0.4.0")).toThrow(ComparisonError);
    expect(() => compareReports(scanReport("http://a.example/", []), journeyReport({}), "0.4.0")).toThrow(
      "Can't compare a scan report with a journey report. Pass two scan reports or two journey reports.",
    );
  });

  it("rejects files that aren't Blindfold reports", () => {
    expect(() => identifyReport({ hello: "world" }, "/x/notes.json")).toThrow('notes.json isn\'t a Blindfold report.json (it has no "findings" list).');
    expect(() => identifyReport({ findings: [] }, "/x/other.json")).toThrow("other.json isn't a Blindfold scan or journey report.");
  });

  it("describes a journey's outcome and effort change", () => {
    const blocked = journeyReport({
      outcome: "blocked",
      blockedAtStep: 2,
      barrierCount: 7,
      effort: { keyboardPresses: 19, mouseClicks: 2, ratio: 9.5, untilBlocked: true, perStep: [] },
    });
    const passed = journeyReport({});
    expect(compareReports(blocked, passed, "0.4.0").journey).toEqual({
      oldOutcome: "blocked",
      newOutcome: "passed",
      summary: "was blocked at step 2, now passes",
      oldEffortRatio: 9.5,
      newEffortRatio: 5.5,
    });
    expect(compareReports(passed, blocked, "0.4.0").journey?.summary).toBe("passed, now blocked at step 2");
    expect(compareReports(blocked, blocked, "0.4.0").journey?.summary).toBe("still blocked at step 2");
  });
});

describe("comparison.html", () => {
  it("escapes page text and has no scripts", () => {
    const hostile = '<img src=x onerror="alert(1)"> & <script>alert(2)</script>';
    const comparison = compareReports(
      scanReport("http://shop.example/", []),
      scanReport("http://shop.example/", [finding({ ruleId: "BF-002", reason: "missing-name", selector: "#evil", description: hostile })]),
      "0.4.0",
    );
    const html = buildComparisonHtml(comparison);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("1 new barrier");
  });
});
