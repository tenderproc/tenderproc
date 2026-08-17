import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The Paddle SDK is large; first import of it in a fresh worker can
    // take several seconds. The default 5s timeout was tripping on cold
    // start alone in tests/billing/*, not on any actual hang.
    testTimeout: 20000,
  },
});
