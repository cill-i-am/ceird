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
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "sh -c 'pnpm --filter api exec tsx watch src/index.ts >/tmp/task-tracker-auth-e2e-api.log 2>&1 & api_pid=$!; trap \"kill $api_pid\" EXIT; until curl --silent --max-time 1 http://127.0.0.1:3001/api/auth/get-session >/dev/null 2>&1; do sleep 0.5; done; pnpm --filter app exec vite dev --port 4173 --strictPort'",
    env: {
      ...process.env,
      AUTH_EMAIL_FROM: playwrightAuthEmailFrom,
      AUTH_EMAIL_FROM_NAME: playwrightAuthEmailFromName,
      BETTER_AUTH_BASE_URL: "http://127.0.0.1:3001",
      BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
      PORT: "3001",
      RESEND_API_KEY: playwrightResendApiKey,
    },
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
