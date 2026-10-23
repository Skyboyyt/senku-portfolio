import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL runs the suite against servers that are already running, such as the
// Cloudflare Workers preview (see docs/DEPLOYMENT.md); otherwise local servers are started.
const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3100",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "./scripts/e2e-servers.sh",
        url: "http://localhost:3100/login",
        timeout: 300_000,
        reuseExistingServer: false,
        stdout: "pipe",
        stderr: "pipe",
      },
});
