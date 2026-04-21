import { defineConfig, devices } from "@playwright/test";

const playwrightBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173";
const playwrightApiUrl =
  process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:3001";
const useExternalServer = process.env.PLAYWRIGHT_USE_EXTERNAL_SERVER === "1";
const playwrightAuthEmailFrom =
  process.env.AUTH_EMAIL_FROM ?? "auth@task-tracker.localhost";
const playwrightAuthEmailFromName =
  process.env.AUTH_EMAIL_FROM_NAME ?? "Task Tracker";
const playwrightCloudflareAccountId =
  process.env.CLOUDFLARE_ACCOUNT_ID ?? "cloudflare-account-test";
const playwrightCloudflareApiToken =
  process.env.CLOUDFLARE_API_TOKEN ?? "cloudflare-token-test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL: playwrightBaseUrl,
    ignoreHTTPSErrors: playwrightBaseUrl.startsWith("https://"),
    trace: "on-first-retry",
  },
  webServer: useExternalServer
    ? undefined
    : {
        command:
          "sh -c 'pnpm --filter api exec tsx watch src/index.ts >/tmp/task-tracker-auth-e2e-api.log 2>&1 & api_pid=$!; trap \"kill $api_pid\" EXIT; until curl --silent --max-time 1 http://127.0.0.1:3001/api/auth/get-session >/dev/null 2>&1; do sleep 0.5; done; pnpm --filter app exec vite dev --port 4173 --strictPort'",
        env: {
          ...process.env,
          AUTH_APP_ORIGIN: "http://127.0.0.1:4173",
          AUTH_EMAIL_FROM: playwrightAuthEmailFrom,
          AUTH_EMAIL_FROM_NAME: playwrightAuthEmailFromName,
          BETTER_AUTH_BASE_URL: playwrightApiUrl,
          BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
          CLOUDFLARE_ACCOUNT_ID: playwrightCloudflareAccountId,
          CLOUDFLARE_API_TOKEN: playwrightCloudflareApiToken,
          PORT: "3001",
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
