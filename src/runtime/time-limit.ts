// Overall time limit for a command, so Blindfold can never hang.

export class TimeLimitError extends Error {
  constructor(seconds: number) {
    super(`Blindfold stopped after ${seconds} s (time limit). Raise --time-limit for very large pages.`);
  }
}

/**
 * Runs `work`; if it takes longer than `seconds`, calls `onTimeLimit` (which
 * must close the browser, so nothing keeps running) and throws TimeLimitError.
 */
export async function runWithTimeLimit<T>(
  seconds: number,
  work: () => Promise<T>,
  onTimeLimit: () => Promise<void>,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  let cleanup: Promise<void> | null = null;
  const running = work();
  const timeLimit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      cleanup = onTimeLimit().catch(() => {});
      void cleanup.finally(() => reject(new TimeLimitError(seconds)));
    }, seconds * 1000);
  });
  timeLimit.catch(() => {});
  try {
    return await Promise.race([running, timeLimit]);
  } catch (error) {
    // Closing the browser makes the work fail first; report the time limit, not that failure.
    if (cleanup) {
      await cleanup;
      throw new TimeLimitError(seconds);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
