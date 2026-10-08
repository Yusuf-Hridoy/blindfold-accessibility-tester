// Pure trap detection over the sequence of focus stops (BF-003).

export interface DetectedFocusTrap {
  /** Index into the stop list where the first of the repeated cycles begins. */
  startIndex: number;
  cycleLength: number;
}

export const TRAP_REPEATS_REQUIRED = 3;

function endsWithRepeatedCycle(stopKeys: readonly number[], cycleLength: number, repeats: number): boolean {
  const end = stopKeys.length;
  for (let offset = 0; offset < cycleLength; offset++) {
    const expected = stopKeys[end - cycleLength + offset];
    for (let repeat = 1; repeat < repeats; repeat++) {
      if (stopKeys[end - (repeat + 1) * cycleLength + offset] !== expected) return false;
    }
  }
  return true;
}

/**
 * A trap is confirmed when the latest stops end with the same cycle repeated
 * `repeats` times in a row, and that cycle doesn't contain the page's first
 * focus stop (which would be a normal wrap-around back to the top).
 */
export function detectFocusTrap(
  stopKeys: readonly number[],
  repeats: number = TRAP_REPEATS_REQUIRED,
): DetectedFocusTrap | null {
  const firstStopKey = stopKeys[0];
  for (let cycleLength = 1; cycleLength * repeats <= stopKeys.length; cycleLength++) {
    const cycle = stopKeys.slice(stopKeys.length - cycleLength);
    if (cycle.includes(firstStopKey as number)) continue;
    if (endsWithRepeatedCycle(stopKeys, cycleLength, repeats)) {
      return { startIndex: stopKeys.length - repeats * cycleLength, cycleLength };
    }
  }
  return null;
}
