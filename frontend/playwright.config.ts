import { defineConfig, devices } from "@playwright/test";
const devProfile = process.env.E2E_APP_PROFILE === "dev";
const externalUrl = process.env.E2E_APP_URL;
export default defineConfig({
  testDir: "./e2e",
  testMatch: devProfile ? "**/dev-profile.spec.ts" : "**/*.spec.ts",
  testIgnore: devProfile ? [] : ["**/dev-profile.spec.ts"],
  fullyParallel: true,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: externalUrl || "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: externalUrl
    ? undefined
    : {
        command: devProfile
          ? "npm run build:dev && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort"
          : process.env.E2E_DEV === "true"
            ? "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort --force"
            : "npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: false,
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
