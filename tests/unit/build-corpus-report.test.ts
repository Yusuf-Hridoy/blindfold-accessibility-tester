// The corpus report's numbers: precision counts only the owner's confirmed
// verdicts, proposals and missing verdicts are kept apart, suspected false
// alarms come from APG and BAD "after" pages, and changes use compare's matching.

import { describe, expect, it } from "vitest";
import type { CorpusFinding, CorpusPageResult, CorpusResults, TriageVerdicts } from "../../scripts/corpus-result-types.ts";
import { changesSinceLastRun, formatPrecision, precisionRows, sourceTotals, suspectedFalseAlarms, triageKey } from "../../scripts/corpus-report-maths.ts";
import { buildCorpusReport } from "../../scripts/corpus-report-markdown.ts";

function finding(url: string, ruleId: CorpusFinding["ruleId"], selector: string, confidence: CorpusFinding["confidence"] = "certain"): CorpusFinding {
  return { url, ruleId, selector, description: `element ${selector}`, confidence };
}

function page(url: string, source: CorpusPageResult["source"], findings: CorpusFinding[], status: CorpusPageResult["status"] = "scanned"): CorpusPageResult {
  return { url, source, category: "test", status, durationMilliseconds: 1, findings, ...(status === "couldn't scan" ? { reason: "HTTP 403" } : {}) };
}

function results(pages: CorpusPageResult[]): CorpusResults {
  return { generatedAt: "2026-10-13T10:00:00.000Z", toolVersion: "0.6.0", pages };
}

const SHOP = "https://shop.example/";
const findings = [
  finding(SHOP, "BF-001", "#a", "certain"),
  finding(SHOP, "BF-001", "#b", "likely"),
  finding(SHOP, "BF-001", "#c", "check-by-hand"),
  finding(SHOP, "BF-001", "#d", "likely"),
  finding(SHOP, "BF-001", "#e", "likely"),
  finding(SHOP, "BF-002", "#f", "certain"),
];
const verdicts: TriageVerdicts = {
  [triageKey(findings[0]!)]: { verdict: "real", note: "" },
  [triageKey(findings[1]!)]: { verdict: "false-alarm", note: "" },
  [triageKey(findings[2]!)]: { verdict: "unsure", note: "" },
  [triageKey(findings[3]!)]: { verdict: "real", note: "", proposed: true },
};

describe("precision", () => {
  it("counts only confirmed real and false-alarm verdicts; unsure, proposed and untriaged are kept apart", () => {
    const [bf001, bf002] = precisionRows(findings, verdicts, (item) => item.ruleId, ["BF-001", "BF-002"]);
    expect(bf001).toEqual({ group: "BF-001", findings: 5, real: 1, falseAlarm: 1, unsure: 1, proposed: 1, untriaged: 1, precision: 0.5 });
    expect(bf002).toMatchObject({ findings: 1, untriaged: 1, precision: null });
    expect(formatPrecision(bf001?.precision ?? null)).toBe("50%");
    expect(formatPrecision(null)).toBe("—");
  });

  it("groups by confidence level, with findings from older results as unknown", () => {
    const rows = precisionRows([...findings, { url: SHOP, ruleId: "BF-004", selector: "#g", description: "g" }], verdicts, (item) => item.confidence ?? "unknown", [
      "certain",
      "likely",
      "check-by-hand",
      "unknown",
    ]);
    expect(rows.map((row) => [row.group, row.findings, row.precision])).toEqual([
      ["certain", 2, 1],
      ["likely", 3, 0],
      ["check-by-hand", 1, null],
      ["unknown", 1, null],
    ]);
  });
});

describe("sources and suspected false alarms", () => {
  const latest = results([
    page("https://apg.example/tabs/", "apg", [finding("https://apg.example/tabs/", "BF-001", "#tab")]),
    page("https://apg.example/menu/", "apg", []),
    page("https://bad.example/before/", "bad-before", [finding("https://bad.example/before/", "BF-002", "#x")]),
    page("https://bad.example/after/", "bad-after", [finding("https://bad.example/after/", "BF-004", "#y")]),
    page(SHOP, "real-site", findings),
    page("https://blocked.example/", "real-site", [], "couldn't scan"),
  ]);

  it("totals each source, keeping pages that couldn't be scanned apart", () => {
    expect(sourceTotals(latest)).toEqual([
      { source: "apg", pages: 2, scanned: 2, couldNotScan: 0, pagesWithFindings: 1, findings: 1 },
      { source: "bad-before", pages: 1, scanned: 1, couldNotScan: 0, pagesWithFindings: 1, findings: 1 },
      { source: "bad-after", pages: 1, scanned: 1, couldNotScan: 0, pagesWithFindings: 1, findings: 1 },
      { source: "real-site", pages: 2, scanned: 1, couldNotScan: 1, pagesWithFindings: 1, findings: 6 },
    ]);
  });

  it("lists findings on APG and BAD after pages as suspected false alarms, not BAD before", () => {
    expect(suspectedFalseAlarms(latest).map(({ finding }) => `${finding.ruleId} ${finding.selector}`)).toEqual(["BF-001 #tab", "BF-004 #y"]);
  });

  it("writes a report with every section, escaping text from the pages", () => {
    const hostile = results([page(SHOP, "real-site", [{ ...finding(SHOP, "BF-001", "#z"), description: "a | <b>bold</b> `code`" }])]);
    const report = buildCorpusReport(hostile, null, {});
    for (const heading of ["## Totals per source", "## Precision per rule", "## Precision per confidence level", "## Suspected false alarms", "## Pages that couldn't be scanned", "## Changed since last run"]) {
      expect(report).toContain(heading);
    }
    expect(report).toContain("No previous run to compare with.");
    // The shop's 5 BF-001s plus the APG page's one (untriaged).
    expect(buildCorpusReport(latest, null, verdicts)).toContain("| BF-001 Control can't be reached by keyboard | 6 | 1 | 1 | 1 | 1 | 2 | 50% |");
  });
});

describe("changes since the last run", () => {
  it("matches findings like blindfold compare, and reports status changes and added or removed pages", () => {
    const previous = results([
      page(SHOP, "real-site", [finding(SHOP, "BF-001", "#a"), finding(SHOP, "BF-001", "#old")]),
      page("https://was-blocked.example/", "real-site", [], "couldn't scan"),
      page("https://removed.example/", "real-site", []),
    ]);
    const latest = results([
      page(SHOP, "real-site", [finding(SHOP, "BF-001", "#a"), finding(SHOP, "BF-002", "#new")]),
      page("https://was-blocked.example/", "real-site", []),
      page("https://added.example/", "real-site", []),
    ]);
    const changes = changesSinceLastRun(previous, latest);
    expect(changes.changed.map((change) => [change.url, change.statusChange, change.fixed.map((item) => item.selector), change.new.map((item) => item.selector)])).toEqual([
      [SHOP, null, ["#old"], ["#new"]],
      ["https://was-blocked.example/", "couldn't scan → scanned", [], []],
    ]);
    expect(changes.addedPages).toEqual(["https://added.example/"]);
    expect(changes.removedPages).toEqual(["https://removed.example/"]);
  });
});
