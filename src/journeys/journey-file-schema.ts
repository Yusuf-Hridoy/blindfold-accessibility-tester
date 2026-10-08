// The journey file format and its validator. Errors name the line and field,
// using positions from the yaml parser.

import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node, type Pair } from "yaml";
import { closestMatches } from "./focus-target-matcher.ts";

export const JOURNEY_KEYS = [
  "Enter",
  "Space",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Tab",
  "Shift+Tab",
] as const;

export type JourneyKey = (typeof JOURNEY_KEYS)[number];

export interface JourneyStep {
  /** Line of the step in the file, for messages. */
  line: number;
  reach?: string;
  press?: JourneyKey;
  type?: string;
  dismiss?: string;
  expectAnnouncement?: string;
  expectFocusInside?: string;
  expectFocusOn?: string;
  expectUrlContains?: string;
  expectClosed?: string;
}

export interface JourneyFileContent {
  name: string;
  startUrl: string;
  steps: JourneyStep[];
}

const TOP_LEVEL_FIELDS = ["name", "start_url", "steps"];

const STEP_FIELDS: Record<string, keyof Omit<JourneyStep, "line">> = {
  reach: "reach",
  press: "press",
  type: "type",
  dismiss: "dismiss",
  expect_announcement: "expectAnnouncement",
  expect_focus_inside: "expectFocusInside",
  expect_focus_on: "expectFocusOn",
  expect_url_contains: "expectUrlContains",
  expect_closed: "expectClosed",
};

const EXAMPLE_VALUES: Record<string, string> = {
  reach: 'reach: "Checkout, button"',
  dismiss: 'dismiss: "Accept, button"',
  type: 'type: "ada@example.com"',
  expect_announcement: 'expect_announcement: "added to cart"',
  expect_focus_inside: 'expect_focus_inside: "Size guide"',
  expect_focus_on: 'expect_focus_on: "Size guide, button"',
  expect_url_contains: 'expect_url_contains: "/checkout.html"',
  expect_closed: 'expect_closed: "Size guide"',
};

export class JourneyFileError extends Error {
  readonly problems: string[];

  constructor(fileLabel: string, problems: string[]) {
    super(problems.map((problem) => `${fileLabel} ${problem}`).join("\n"));
    this.problems = problems;
  }
}

function suggestionFor(unknownField: string, allowedFields: string[]): string {
  const [closest] = closestMatches(unknownField, allowedFields, 1);
  return closest ? ` Did you mean "${closest}"?` : "";
}

/** Parses and validates journey YAML. `fileLabel` (e.g. the file name) starts every message. */
export function parseJourneyFile(text: string, fileLabel: string): JourneyFileContent {
  const lineCounter = new LineCounter();
  const document = parseDocument(text, { lineCounter, prettyErrors: false });
  const problems: string[] = [];
  const lineOf = (node: Node | null | undefined): number =>
    node?.range ? lineCounter.linePos(node.range[0]).line : 1;

  const [syntaxError] = document.errors;
  if (syntaxError) {
    const line = syntaxError.linePos?.[0].line ?? 1;
    throw new JourneyFileError(fileLabel, [`line ${line}: this isn't valid YAML (${syntaxError.message.split("\n")[0]}).`]);
  }

  const root = document.contents;
  if (!isMap(root)) {
    throw new JourneyFileError(fileLabel, ['line 1: a journey file needs "name", "start_url" and "steps".']);
  }

  const topLevel = new Map<string, Pair<unknown, unknown>>();
  for (const pair of root.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : "";
    if (!TOP_LEVEL_FIELDS.includes(key)) {
      problems.push(`line ${lineOf(pair.key as Node)}: unknown field "${key}".${suggestionFor(key, TOP_LEVEL_FIELDS)}`);
      continue;
    }
    topLevel.set(key, pair);
  }

  function requiredText(field: string, example: string): string {
    const pair = topLevel.get(field);
    if (!pair) {
      problems.push(`line 1: missing "${field}". Add it, e.g. ${example}.`);
      return "";
    }
    const value = pair.value;
    if (!isScalar(value) || typeof value.value !== "string" || value.value.trim() === "") {
      problems.push(`line ${lineOf(pair.key as Node)}: "${field}" must be text, e.g. ${example}.`);
      return "";
    }
    return value.value;
  }

  const name = requiredText("name", 'name: "Product to checkout"');
  const startUrl = requiredText("start_url", "start_url: /cart.html");

  const steps: JourneyStep[] = [];
  const stepsPair = topLevel.get("steps");
  if (!stepsPair) {
    problems.push('line 1: missing "steps". Add a list of steps, e.g. steps: [ { reach: "Checkout, button", press: Enter } ].');
  } else if (!isSeq(stepsPair.value) || stepsPair.value.items.length === 0) {
    problems.push(`line ${lineOf(stepsPair.key as Node)}: "steps" must be a list with at least one step.`);
  } else {
    stepsPair.value.items.forEach((item, index) => {
      const step = validateStep(item as Node, index + 1, lineOf, problems);
      if (step) steps.push(step);
    });
  }

  if (problems.length > 0) throw new JourneyFileError(fileLabel, problems);
  return { name, startUrl, steps };
}

function validateStep(
  node: Node,
  stepNumber: number,
  lineOf: (node: Node | null | undefined) => number,
  problems: string[],
): JourneyStep | null {
  const stepLine = lineOf(node);
  if (!isMap(node)) {
    problems.push(`line ${stepLine}: step ${stepNumber} must be a set of fields, e.g. - reach: "Checkout, button".`);
    return null;
  }
  const step: JourneyStep = { line: stepLine };
  const problemCountBefore = problems.length;

  for (const pair of node.items) {
    const field = isScalar(pair.key) ? String(pair.key.value) : "";
    const fieldLine = lineOf(pair.key as Node);
    const property = STEP_FIELDS[field];
    if (!property) {
      problems.push(`line ${fieldLine}: step ${stepNumber} has an unknown field "${field}".${suggestionFor(field, Object.keys(STEP_FIELDS))}`);
      continue;
    }
    const value = isScalar(pair.value) ? pair.value.value : undefined;
    if (field === "press") {
      const key = typeof value === "string" ? value : String(value);
      if (!(JOURNEY_KEYS as readonly string[]).includes(key)) {
        problems.push(
          `line ${fieldLine}: step ${stepNumber} "press" is "${key}", which isn't a supported key. Use one of: ${JOURNEY_KEYS.join(", ")}.`,
        );
        continue;
      }
      step.press = key as JourneyKey;
      continue;
    }
    if (typeof value !== "string" || value.trim() === "") {
      problems.push(`line ${fieldLine}: step ${stepNumber} "${field}" must be text in quotes, e.g. ${EXAMPLE_VALUES[field]}.`);
      continue;
    }
    step[property as Exclude<keyof JourneyStep, "line" | "press">] = value;
  }
  if (problems.length > problemCountBefore) return null;

  const hasExpectation = Object.keys(step).some((key) => key.startsWith("expect"));
  if (step.dismiss && (step.reach || step.press)) {
    problems.push(
      `line ${stepLine}: step ${stepNumber} has "dismiss" together with "${step.reach ? "reach" : "press"}". "dismiss" already reaches the control and presses Enter, so use one.`,
    );
  } else if (step.reach && !step.press && !step.type && !hasExpectation) {
    problems.push(`line ${stepLine}: step ${stepNumber} has "reach" but no "press" and no "expect_*". Add a key to press.`);
  } else if (!step.reach && !step.press && !step.type && !step.dismiss) {
    problems.push(`line ${stepLine}: step ${stepNumber} has no action. Add "reach", "press", "type" or "dismiss".`);
  }
  return problems.length > problemCountBefore ? null : step;
}
