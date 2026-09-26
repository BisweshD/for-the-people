import { defineConfig, devices } from "@playwright/test";

/**
 * E2E, visual, accessibility, and provenance tests against a production build (next start).
 * On Windows the installed Chrome is used; elsewhere Playwright's bundled Chromium.
 */

const PORT = Number(process.env.E2E_PORT ?? 3200);
const channel = process.env.PW_CHANNEL ?? (process.platform === "win32" ? "chrome" : undefined);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "../../test-results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.015, animations: "disabled" },
  },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel,
    locale: "en-US",
    timezoneId: "America/New_York",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["iPhone 14"],
        browserName: "chromium",
        channel,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "desktop",
      use: { browserName: "chromium", channel, viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
