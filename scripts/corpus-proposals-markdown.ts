// corpus/PROPOSALS-TO-CONFIRM.md: every finding in the latest run whose
// verdict Claude proposed and the owner hasn't confirmed, grouped by class,
// so the owner can confirm a whole class at once. Proposed verdicts never
// count in precision until confirmed.

import { escapeMarkdownCell } from "../src/action/job-summary-builder.ts";
import { CONFIDENCE_LABELS } from "../src/rules/finding-confidence.ts";
import type { CorpusFinding, CorpusResults, TriageEntry, TriageVerdicts } from "./corpus-result-types.ts";
import { allFindings, findVerdict } from "./corpus-report-maths.ts";
import { describeRunTimes } from "./corpus-report-markdown.ts";

const MAX_LISTED_PAGES = 8;
const NO_CLASS = "No class";
const CLASS_PREFIX_ORDER = ["FA", "R", "U"];

/** Class titles from the summary table in corpus/TRIAGE-CLASSES.md (`| FA-1 | <pattern> | …`). */
export function parseClassTitles(triageClassesMarkdown: string): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const line of triageClassesMarkdown.split("\n")) {
    const match = /^\|\s*((?:FA|R|U)-\d+)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (match?.[1] && match[2] && !(match[1] in titles)) titles[match[1]] = match[2];
  }
  return titles;
}

/** FA-1, FA-2 … R-1 … U-1 …, then anything else, then findings without a class. */
function compareClasses(a: string, b: string): number {
  const rank = (name: string): [number, number] => {
    if (name === NO_CLASS) return [CLASS_PREFIX_ORDER.length + 1, 0];
    const [prefix = "", number = ""] = name.split("-");
    const prefixRank = CLASS_PREFIX_ORDER.indexOf(prefix);
    return [prefixRank === -1 ? CLASS_PREFIX_ORDER.length : prefixRank, Number.parseInt(number, 10) || 0];
  };
  const [rankA, numberA] = rank(a);
  const [rankB, numberB] = rank(b);
  return rankA - rankB || numberA - numberB || a.localeCompare(b);
}

interface ProposalGroup {
  name: string;
  members: { finding: CorpusFinding; entry: TriageEntry }[];
}

function describeVerdicts(group: ProposalGroup): string {
  const counts = new Map<string, number>();
  for (const { entry } of group.members) counts.set(entry.verdict, (counts.get(entry.verdict) ?? 0) + 1);
  return counts.size === 1 ? [...counts.keys()].join("") : [...counts].map(([verdict, count]) => `${verdict} ×${count}`).join(", ");
}

/** Page text inside a code span: a backtick or line break would end it early. */
function codeSpan(text: string): string {
  return `\`${text.replace(/`/g, "'").replace(/\s*\n\s*/g, " ")}\``;
}

function describeFinding(finding: CorpusFinding): string {
  const confidence = CONFIDENCE_LABELS[finding.confidence ?? "unknown"];
  return `${escapeMarkdownCell(finding.url)}: ${finding.ruleId} [${confidence}] ${codeSpan(finding.description)} (${codeSpan(finding.selector)})`;
}

export function buildProposalsReport(latest: CorpusResults, verdicts: TriageVerdicts, classTitles: Record<string, string> = {}): string {
  const groups = new Map<string, ProposalGroup>();
  const usedKeys = new Set<string>();
  for (const finding of allFindings(latest)) {
    const match = findVerdict(verdicts, finding);
    if (!match) continue;
    usedKeys.add(match.key);
    if (!match.entry.proposed) continue;
    const name = match.entry.class ?? NO_CLASS;
    const group = groups.get(name) ?? { name, members: [] };
    groups.set(name, group);
    group.members.push({ finding, entry: match.entry });
  }
  const ordered = [...groups.values()].sort((a, b) => compareClasses(a.name, b.name));
  const total = ordered.reduce((sum, group) => sum + group.members.length, 0);
  const unmatched = Object.entries(verdicts).filter(([key, entry]) => entry.proposed && !usedKeys.has(key)).length;

  const lines = [
    "# Proposed verdicts to confirm",
    "",
    `${describeRunTimes(latest)} · Blindfold ${latest.toolVersion}. Built by \`npm run corpus:report\`.`,
    "",
    `**${total} findings** in the latest run carry a verdict Claude proposed (\`"proposed": true\` in \`corpus/triage-verdicts.json\`).`,
    "They don't count in precision until you confirm them. To confirm, remove `\"proposed\": true` from the entries",
    "(or change `verdict` first). Classes are described in `corpus/TRIAGE-CLASSES.md`.",
    "",
  ];
  if (ordered.length === 0) {
    lines.push("Nothing to confirm.");
  } else {
    lines.push("## Summary", "", "| Class | Pattern | Rules | Proposed verdict | Findings | Pages |", "|---|---|---|---|---|---|");
    for (const group of ordered) {
      const rules = [...new Set(group.members.map(({ finding }) => finding.ruleId))].sort().join(", ");
      const pages = new Set(group.members.map(({ finding }) => finding.url)).size;
      lines.push(`| ${group.name} | ${escapeMarkdownCell(classTitles[group.name] ?? "")} | ${rules} | ${describeVerdicts(group)} | ${group.members.length} | ${pages} |`);
    }
    for (const group of ordered) {
      const title = classTitles[group.name];
      const pages = [...new Set(group.members.map(({ finding }) => finding.url))];
      const listed = pages.slice(0, MAX_LISTED_PAGES).map(escapeMarkdownCell).join(", ");
      const more = pages.length > MAX_LISTED_PAGES ? `, and ${pages.length - MAX_LISTED_PAGES} more` : "";
      const [example] = group.members;
      lines.push(
        "",
        `## ${group.name}${title ? `: ${escapeMarkdownCell(title)}` : ""}`,
        "",
        `- **Proposed verdict:** ${describeVerdicts(group)} · **Findings:** ${group.members.length}`,
        `- **Pages (${pages.length}):** ${listed}${more}`,
      );
      if (example) {
        lines.push(`- **Example:** ${describeFinding(example.finding)}`);
        if (example.entry.note) lines.push(`- **Note:** ${escapeMarkdownCell(example.entry.note)}`);
      }
    }
  }
  if (unmatched > 0) {
    lines.push("", `${unmatched} more proposed verdicts match no finding in this run (fixed, or the page wasn't scanned); they're left out.`);
  }
  return `${lines.join("\n")}\n`;
}
