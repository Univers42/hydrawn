import { defineConfig, devices } from "@playwright/test";

/**
 * The library mounted in a host page (`e2e/fixture`), served from `dist/` under a strict CSP
 * (`e2e/serve.mjs`). The same rules as the app's suite (`../../playwright.config.ts`): no
 * retries, one worker, a fixed viewport. Run after `vite build`: it tests what ships.
 */
const PORT = Number(process.env.BOARD_FIXTURE_PORT ?? 5476);

export default defineConfig({
  testDir: "e2e",
  retries: 0,
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node e2e/serve.mjs",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
