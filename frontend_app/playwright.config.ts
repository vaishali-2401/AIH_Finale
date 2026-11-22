import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke test against the real backend serving the exported
 * frontend (the production setup), with no API key (keyword mode).
 *
 *   npm run build && npm run test:e2e
 *
 * Uses Playwright's bundled Chromium (`npx playwright install chromium`).
 * Set PW_CHANNEL=chrome to use an installed Google Chrome instead, and
 * E2E_PYTHON to point at a Python with the backend requirements installed.
 */
const PORT = 8099;
const python = process.env.E2E_PYTHON ?? ".venv/bin/python";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.PW_CHANNEL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    cwd: "../backend",
    command: `rm -rf ../frontend_app/.e2e-data && "${python}" -m app`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DATA_DIR: "../frontend_app/.e2e-data",
      FRONTEND_DIST: "../frontend_app/out",
      GEMINI_API_KEY: "",
      TTS_API_KEY: "",
    },
  },
});
