// Guards for action.yml: inputs must never be expanded inside run: scripts
// (script injection), and the Action must stop early on non-Linux runners.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface ActionStep {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}

const action = parse(readFileSync(path.join(import.meta.dirname, "..", "..", "action.yml"), "utf8")) as {
  inputs: Record<string, { default?: string; required?: boolean }>;
  runs: { using: string; steps: ActionStep[] };
};

describe("action.yml", () => {
  it("is a composite action with the documented inputs", () => {
    expect(action.runs.using).toBe("composite");
    expect(Object.keys(action.inputs)).toEqual([
      "command",
      "target",
      "base-url",
      "viewport",
      "start-command",
      "wait-for-url",
      "baseline",
      "fail-on",
      "output",
      "artifact-name",
    ]);
    expect(action.inputs.target?.required).toBe(true);
    expect(action.inputs["fail-on"]?.default).toBe("findings");
    expect(action.inputs["artifact-name"]?.default).toBe("blindfold-results");
  });

  it("never puts an expression inside a run: script; inputs go through env:", () => {
    const scripts = action.runs.steps.filter((step) => step.run !== undefined);
    expect(scripts.length).toBeGreaterThan(5);
    for (const step of scripts) expect(step.run, step.name).not.toContain("${{");
  });

  it("checks for a Linux runner first", () => {
    const [firstStep] = action.runs.steps;
    expect(firstStep?.env?.RUNNER_OS_NAME).toBe("${{ runner.os }}");
    expect(firstStep?.run).toContain("Blindfold's Action currently supports Linux runners (ubuntu-latest).");
  });

  it("turns audio off", () => {
    const runStep = action.runs.steps.find((step) => step.name === "Run Blindfold");
    expect(runStep?.run).toContain("--no-audio");
  });
});
