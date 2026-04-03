import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "sh -c 'BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef PORT=3001 pnpm --filter api dev:raw >/tmp/task-tracker-auth-e2e-api.log 2>&1 & api_pid=$!; trap \"kill $api_pid\" EXIT; until curl --silent --max-time 1 http://127.0.0.1:3001/api/auth/get-session >/dev/null 2>&1; do sleep 0.5; done; BETTER_AUTH_BASE_URL=http://127.0.0.1:3001/api/auth pnpm --filter app exec vite dev --port 4173 --strictPort'",
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
