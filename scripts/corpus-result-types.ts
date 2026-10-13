// The real-world corpus files: page lists (corpus/*-pages.json), results
// (corpus/latest-results.json) and the owner's verdicts (corpus/triage-verdicts.json).

import type { Bf002Reason, FindingConfidence, RuleId, WalkStopReason } from "../src/types/scan-result-types.ts";

export interface CorpusPage {
  url: string;
  category: string;
  notes: string;
}

/** Where a page comes from. BAD pages are split by version: "after" pages must have no false alarms. */
export type CorpusSource = "apg" | "bad-before" | "bad-after" | "real-site";

export const CORPUS_SOURCES: CorpusSource[] = ["apg", "bad-before", "bad-after", "real-site"];

export const SOURCE_TITLES: Record<CorpusSource, string> = {
  apg: "APG examples (expected: 0 findings)",
  "bad-before": "BAD demo, before (expected: findings)",
  "bad-after": "BAD demo, after (expected: no false alarms)",
  "real-site": "Real sites",
};

export interface CorpusFinding {
  url: string;
  ruleId: RuleId;
  reason?: Bf002Reason;
  selector: string;
  description: string;
  /** Missing only in results written before confidence levels existed. */
  confidence?: FindingConfidence;
}

export interface CorpusPageResult {
  url: string;
  source: CorpusSource;
  category: string;
  status: "scanned" | "couldn't scan";
  /** Why the page couldn't be scanned (the message the CLI would print). */
  reason?: string;
  stoppedBecause?: WalkStopReason;
  focusStops?: number;
  warnings?: string[];
  durationMilliseconds: number;
  findings: CorpusFinding[];
}

export interface CorpusResults {
  generatedAt: string;
  toolVersion: string;
  pages: CorpusPageResult[];
}

export type TriageVerdict = "real" | "false-alarm" | "unsure";

export interface TriageEntry {
  verdict: TriageVerdict;
  note: string;
  /** Set when Claude proposed it; the owner confirms by removing it. Proposed verdicts never count. */
  proposed?: boolean;
  /** The false-alarm or real-barrier class from corpus/TRIAGE-CLASSES.md, if any. */
  class?: string;
}

/** Keyed by triageKey(finding): `url ruleId selector`. */
export type TriageVerdicts = Record<string, TriageEntry>;
