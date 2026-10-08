import { describe, expect, it } from "vitest";
import { detectFocusTrap } from "../../src/focus/focus-trap-detector.ts";

describe("detectFocusTrap", () => {
  it("finds a cycle of length 1 (focus stuck on one element)", () => {
    expect(detectFocusTrap([1, 2, 3, 3, 3])).toEqual({ startIndex: 2, cycleLength: 1 });
  });

  it("finds a cycle of length 2", () => {
    expect(detectFocusTrap([1, 2, 3, 4, 3, 4, 3, 4])).toEqual({ startIndex: 2, cycleLength: 2 });
  });

  it("finds a cycle of length 3", () => {
    expect(detectFocusTrap([1, 2, 3, 4, 2, 3, 4, 2, 3, 4])).toEqual({ startIndex: 1, cycleLength: 3 });
  });

  it("needs three repeats in a row", () => {
    expect(detectFocusTrap([1, 2, 3, 4, 3, 4])).toBeNull();
  });

  it("does not treat a natural wrap-around to the first stop as a trap", () => {
    expect(detectFocusTrap([1, 2, 3, 1, 2, 3, 1, 2, 3])).toBeNull();
    expect(detectFocusTrap([1, 1, 1])).toBeNull();
  });

  it("finds nothing in a long walk without a cycle (max-tabs case)", () => {
    const distinctStops = Array.from({ length: 400 }, (_, index) => index + 1);
    expect(detectFocusTrap(distinctStops)).toBeNull();
  });

  it("finds nothing in an empty walk", () => {
    expect(detectFocusTrap([])).toBeNull();
  });
});
