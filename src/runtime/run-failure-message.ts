// The plain-language message for a command that couldn't complete, shared by
// the CLI (printed, exit code 2) and the web UI (shown on the page).

import { MissingBrowserError } from "../browser/missing-browser-check.ts";
import { ComparisonError } from "../compare/report-comparison.ts";
import { JourneyFileError } from "../journeys/journey-file-schema.ts";
import { describeError, ScanFailedError } from "../scan/page-scanner.ts";
import { SessionFileError } from "../sessions/session-file-loader.ts";
import { TimeLimitError } from "./time-limit.ts";

/** `what` names the command in the message: "scan", "journey", "comparison" or "login". */
export function describeRunFailure(error: unknown, what: string): string {
  if (
    error instanceof TimeLimitError ||
    error instanceof JourneyFileError ||
    error instanceof SessionFileError ||
    error instanceof ComparisonError ||
    error instanceof MissingBrowserError
  ) {
    return error.message;
  }
  if (error instanceof ScanFailedError) return `Blindfold couldn't complete the ${what}. ${error.message}`;
  return `Blindfold stopped unexpectedly: ${describeError(error)}`;
}
