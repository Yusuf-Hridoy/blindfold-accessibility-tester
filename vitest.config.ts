import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Browser tests launch Chromium, which is slow on cold CI runners.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
