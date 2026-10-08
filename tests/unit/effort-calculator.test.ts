import { describe, expect, it } from "vitest";
import { calculateEffort } from "../../src/metrics/effort-calculator.ts";

describe("calculateEffort", () => {
  it("counts key presses and clicks per step and in total", () => {
    const effort = calculateEffort(
      [
        { stepNumber: 1, keysPressed: ["Tab", "Tab", "Tab", "Enter"], needsClick: true, ran: true },
        { stepNumber: 2, keysPressed: ["Shift+Tab", "ArrowDown", "Space"], needsClick: true, ran: true },
        { stepNumber: 3, keysPressed: ["Escape"], needsClick: true, ran: true },
      ],
      false,
    );
    expect(effort.perStep).toEqual([
      { stepNumber: 1, keyboardPresses: 4, mouseClicks: 1, ratio: 4 },
      { stepNumber: 2, keyboardPresses: 3, mouseClicks: 1, ratio: 3 },
      { stepNumber: 3, keyboardPresses: 1, mouseClicks: 1, ratio: 1 },
    ]);
    expect(effort).toMatchObject({ keyboardPresses: 8, mouseClicks: 3, ratio: 2.7, untilBlocked: false });
  });

  it("excludes typed characters", () => {
    const effort = calculateEffort([{ stepNumber: 1, keysPressed: ["Tab", "a", "d", "a"], needsClick: false, ran: true }], false);
    expect(effort).toMatchObject({ keyboardPresses: 1, mouseClicks: 0, ratio: null });
  });

  it("counts a blocked journey only up to the blocking step", () => {
    const effort = calculateEffort(
      [
        { stepNumber: 1, keysPressed: ["Tab", "Enter"], needsClick: true, ran: true },
        { stepNumber: 2, keysPressed: Array(10).fill("Tab"), needsClick: true, ran: true },
        { stepNumber: 3, keysPressed: [], needsClick: true, ran: false },
      ],
      true,
    );
    expect(effort).toMatchObject({ keyboardPresses: 12, mouseClicks: 2, ratio: 6, untilBlocked: true });
    expect(effort.perStep).toHaveLength(2);
  });
});
