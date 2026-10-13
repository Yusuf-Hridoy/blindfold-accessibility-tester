import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Browser tests launch Chromium, which is slow on cold CI runners.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Most test files run their own Chromium, which is itself several busy
    // processes. One file per core starved them on an 8-core machine, so a
    // timing-sensitive test (a new tab opened without follow_new_tab) missed
    // the tab. Half the cores is faster overall and keeps timing realistic.
    maxWorkers: Math.max(1, Math.floor(availableParallelism() / 2)),
  },
});
