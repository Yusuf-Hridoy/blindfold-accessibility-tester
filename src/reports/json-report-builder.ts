import type { JourneyResult } from "../types/journey-result-types.ts";
import type { ScanResult } from "../types/scan-result-types.ts";

/** report.json: the full scan or journey result. Screenshots are deliberately not included. */
export function buildJsonReport(result: ScanResult | JourneyResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
