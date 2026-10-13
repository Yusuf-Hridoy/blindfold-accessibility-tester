// Cancelling a scan or journey from the web UI (an AbortSignal). A cancelled
// run writes no report; it is neither a finding nor a failure.

export class RunCancelledError extends Error {
  constructor() {
    super("The run was cancelled.");
  }
}

export function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new RunCancelledError();
}
