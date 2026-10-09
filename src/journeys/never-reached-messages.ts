// The hint printed under a step whose target was never reached. "Did you mean"
// only helps for ordinary misses; a trap is explained by its BF-003 finding,
// and inside a modal the user has to close it first.

import type { JourneyStepResult } from "../types/journey-result-types.ts";

export function neverReachedHint(step: Pick<JourneyStepResult, "neverReachedBecause" | "confinedIn" | "closestMatches">): string | null {
  switch (step.neverReachedBecause) {
    case "confined": {
      const closeIt = "Close it first (for example, press: Escape).";
      if (!step.confinedIn) return `Focus is kept inside part of the page. ${closeIt}`;
      if (!step.confinedIn.isDialog) return `Focus is kept inside "${step.confinedIn.name}" (the rest of the page is inert). ${closeIt}`;
      return step.confinedIn.name ? `Focus is inside the "${step.confinedIn.name}" dialog. ${closeIt}` : `Focus is inside a dialog with no name. ${closeIt}`;
    }
    case "full-cycle":
    case "max-tabs": {
      const [bestMatch] = step.closestMatches ?? [];
      return bestMatch ? `Did you mean "${bestMatch}"?` : null;
    }
    default:
      return null;
  }
}
