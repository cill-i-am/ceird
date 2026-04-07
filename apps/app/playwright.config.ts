import { defineConfig, devices } from "@playwright/test";

const playwrightAuthEmailFrom =
  process.env.AUTH_EMAIL_FROM ?? "auth@task-tracker.localhost";
const playwrightAuthEmailFromName =
  process.env.AUTH_EMAIL_FROM_NAME ?? "Task Tracker";
const playwrightResendApiKey =
  process.env.RESEND_API_KEY ?? "re_test_placeholder";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "pnpm --dir ../api exec tsx src/index.ts",
      env: {
        ...process.env,
        AUTH_EMAIL_FROM: playwrightAuthEmailFrom,
        AUTH_EMAIL_FROM_NAME: playwrightAuthEmailFromName,
        BETTER_AUTH_BASE_URL: "http://127.0.0.1:3001",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        PORT: "3001",
        RESEND_API_KEY: playwrightResendApiKey,
      },
      url: "http://127.0.0.1:3001/api/auth/get-session",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm exec vite dev --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
