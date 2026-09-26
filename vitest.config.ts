import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The web app's own import alias, so its server modules can be tested directly.
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) } },
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "apps/web/src/**/*.test.ts",
      "apps/web/test/**/*.test.ts",
    ],
    environment: "node",
    testTimeout: 30_000,
    // Setup hooks open an in-memory PGlite database and run migrations; with dozens of test files
    // starting at once on a busy machine that can pass the 10 s default. The tests themselves are unchanged.
    hookTimeout: 60_000,
  },
});
