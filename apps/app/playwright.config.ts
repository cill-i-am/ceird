import { defineConfig, devices } from "@playwright/test";

import { DEFAULT_API_ORIGIN, DEFAULT_APP_ORIGIN } from "./e2e/test-urls";

const playwrightBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? DEFAULT_APP_ORIGIN;
const playwrightApiUrl = process.env.PLAYWRIGHT_API_URL ?? DEFAULT_API_ORIGIN;
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
        command: `sh -c '
          set -eu
          pnpm --filter api db:migrate
          pnpm --filter api exec tsx src/index.ts &
          api_pid=$!
          trap "kill $api_pid 2>/dev/null || true" EXIT
          until curl --silent --max-time 1 http://127.0.0.1:3001/api/auth/get-session >/dev/null 2>&1; do
            if ! kill -0 "$api_pid" 2>/dev/null; then
              wait "$api_pid"
              exit 1
            fi
            sleep 0.5
          done
          pnpm --filter app exec vite dev --host 127.0.0.1 --port 4173 --strictPort
        '`,
        env: {
          ...process.env,
          API_ORIGIN: playwrightApiUrl,
          AUTH_APP_ORIGIN: playwrightBaseUrl,
          AUTH_EMAIL_FROM: playwrightAuthEmailFrom,
          AUTH_EMAIL_FROM_NAME: playwrightAuthEmailFromName,
          AUTH_EMAIL_TRANSPORT: "noop",
          BETTER_AUTH_BASE_URL: playwrightApiUrl,
          BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
          CLOUDFLARE_ACCOUNT_ID: playwrightCloudflareAccountId,
          CLOUDFLARE_API_TOKEN: playwrightCloudflareApiToken,
          PORT: "3001",
          SITE_GEOCODER_MODE: "stub",
        },
        port: 4173,
        reuseExistingServer: false,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
