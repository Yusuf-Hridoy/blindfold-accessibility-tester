// Effort ratio: keyboard presses needed vs mouse clicks for the same journey.

export interface StepEffortInput {
  stepNumber: number;
  keysPressed: string[];
  /** The step has `press` or `dismiss`: a mouse user clicks its target once. */
  needsClick: boolean;
  ran: boolean;
}

export interface StepEffort {
  stepNumber: number;
  keyboardPresses: number;
  mouseClicks: number;
  /** null when there were no clicks to compare against. */
  ratio: number | null;
}

export interface EffortSummary {
  keyboardPresses: number;
  mouseClicks: number;
  ratio: number | null;
  /** The journey was blocked; totals cover the steps up to the blocking one. */
  untilBlocked: boolean;
  perStep: StepEffort[];
}

/** Typed characters are not key presses for effort; only navigation and action keys count. */
const COUNTED_KEYS = new Set([
  "Tab",
  "Shift+Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
  "Space",
  "Escape",
]);

function ratioOf(keyboardPresses: number, mouseClicks: number): number | null {
  return mouseClicks === 0 ? null : Math.round((keyboardPresses / mouseClicks) * 10) / 10;
}

export function calculateEffort(steps: StepEffortInput[], blocked: boolean): EffortSummary {
  const perStep = steps
    .filter((step) => step.ran)
    .map((step) => {
      const keyboardPresses = step.keysPressed.filter((key) => COUNTED_KEYS.has(key)).length;
      const mouseClicks = step.needsClick ? 1 : 0;
      return { stepNumber: step.stepNumber, keyboardPresses, mouseClicks, ratio: ratioOf(keyboardPresses, mouseClicks) };
    });
  const keyboardPresses = perStep.reduce((sum, step) => sum + step.keyboardPresses, 0);
  const mouseClicks = perStep.reduce((sum, step) => sum + step.mouseClicks, 0);
  return { keyboardPresses, mouseClicks, ratio: ratioOf(keyboardPresses, mouseClicks), untilBlocked: blocked, perStep };
}
