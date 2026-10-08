import type { CollectedScanData, RuleFinding } from "../types/scan-result-types.ts";

/**
 * BF-008: an overlay blocks the page and none of its controls can be reached
 * by keyboard. In a scan, a control the Tab walk actually reached also counts
 * as reachable.
 */
export function findOverlaysBlockingKeyboard(
  data: Pick<CollectedScanData, "blockingOverlays" | "focusStops">,
): RuleFinding[] {
  const reachedElementIds = new Set(data.focusStops.map((stop) => stop.elementId));
  return data.blockingOverlays
    .filter(
      (overlay) =>
        overlay.blocksPage &&
        overlay.controls.length > 0 &&
        !overlay.controls.some((control) => control.keyboardReachable || reachedElementIds.has(control.elementId)),
    )
    .map((overlay) => ({
      ruleId: "BF-008",
      elementId: overlay.container.elementId,
      selector: overlay.container.selector,
      description: overlay.container.description,
      step: null,
      overlayControls: overlay.controls.map(({ elementId, selector, description }) => ({ elementId, selector, description })),
      message: `overlay with ${overlay.controls.map((control) => control.description).join(", ")} can't be used by keyboard`,
    }));
}
