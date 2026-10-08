import type { ScanResult } from "../types/scan-result-types.ts";

/** report.json: the full scan result. Screenshots are deliberately not included. */
export function buildJsonReport(result: ScanResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
