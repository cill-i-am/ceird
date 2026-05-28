import { defineConfig, devices } from "@playwright/test";

import { AGENT_ORIGIN, API_ORIGIN, APP_ORIGIN } from "./e2e/test-origins";

const playwrightBaseUrl = APP_ORIGIN;
const playwrightApiUrl = API_ORIGIN;
const playwrightAgentUrl = AGENT_ORIGIN;
const usePackageLocalServer =
  process.env.PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER === "1";
const useSystemChrome = process.env.CI === "true";
const playwrightAuthEmailFrom =
  process.env.AUTH_EMAIL_FROM ?? "auth@ceird.localhost";
const playwrightAuthEmailFromName = process.env.AUTH_EMAIL_FROM_NAME ?? "Ceird";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL: playwrightBaseUrl,
    ignoreHTTPSErrors: playwrightBaseUrl.startsWith("https://"),
    trace: "on-first-retry",
  },
  webServer: usePackageLocalServer
    ? {
        command: `sh -c '
          set -eu
          pnpm --filter domain db:migrate
          PORT=3002 pnpm --filter domain exec tsx src/index.ts &
          domain_pid=$!
          PORT=3001 DOMAIN_ORIGIN=http://127.0.0.1:3002 pnpm --filter api exec tsx src/index.ts &
          api_pid=$!
          trap "kill $api_pid $domain_pid 2>/dev/null || true" EXIT
          until curl --silent --max-time 1 http://127.0.0.1:3001/api/auth/get-session >/dev/null 2>&1; do
            if ! kill -0 "$api_pid" 2>/dev/null || ! kill -0 "$domain_pid" 2>/dev/null; then
              wait "$domain_pid" 2>/dev/null || true
              wait "$api_pid"
              exit 1
            fi
            sleep 0.5
          done
          pnpm --filter app exec vite dev --host 127.0.0.1 --port 4173 --strictPort
        '`,
        env: {
          ...process.env,
          AGENT_INTERNAL_SECRET: "agent-e2e-internal-secret",
          API_ORIGIN: playwrightApiUrl,
          AGENT_ORIGIN: playwrightAgentUrl,
          AUTH_APP_ORIGIN: playwrightBaseUrl,
          AUTH_EMAIL_FROM: playwrightAuthEmailFrom,
          AUTH_EMAIL_FROM_NAME: playwrightAuthEmailFromName,
          AUTH_RATE_LIMIT_ENABLED: "false",
          BETTER_AUTH_BASE_URL: playwrightApiUrl,
          BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
          DOMAIN_ORIGIN: "http://127.0.0.1:3002",
          PORT: "3001",
          VITE_AGENT_ORIGIN: playwrightAgentUrl,
        },
        port: 4173,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(useSystemChrome ? { channel: "chrome" } : {}),
      },
    },
  ],
});
