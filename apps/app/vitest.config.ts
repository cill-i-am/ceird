import { fileURLToPath } from "node:url";

import viteReact from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import type { TestProjectInlineConfiguration } from "vitest/config";

const cloudflareWorkersEnvStub = fileURLToPath(
  new URL("src/test/cloudflare-workers.ts", import.meta.url)
);

const tanstackStartServerOptimizerExclusions = [
  "@tanstack/react-start",
  "@tanstack/react-start/server",
  "@tanstack/react-start-server",
  "@tanstack/start-server-core",
  "@tanstack/start-storage-context",
];
const useSystemChrome = process.env.CI === "true";

const testProjects = [
  {
    extends: true,
    test: {
      name: "app-node",
      environment: "node",
      exclude: ["src/**/*.browser.test.ts"],
      include: ["src/**/*.test.ts"],
    },
  },
  {
    extends: true,
    test: {
      name: "app-browser-chromium",
      include: ["src/**/*.browser.test.ts", "src/**/*.browser.test.tsx"],
      browser: {
        enabled: true,
        headless: true,
        instances: [
          {
            browser: "chromium",
            viewport: { height: 720, width: 1280 },
          },
        ],
        provider: playwright({
          launchOptions: useSystemChrome ? { channel: "chrome" } : undefined,
        }),
      },
      deps: {
        optimizer: {
          client: {
            exclude: tanstackStartServerOptimizerExclusions,
          },
        },
      },
    },
  },
] satisfies TestProjectInlineConfiguration[];

const config = {
  optimizeDeps: {
    exclude: tanstackStartServerOptimizerExclusions,
  },
  plugins: [viteReact()],
  resolve: {
    alias: [
      { find: "cloudflare:workers", replacement: cloudflareWorkersEnvStub },
    ],
    tsconfigPaths: true,
  },
  test: {
    fileParallelism: false,
    globals: true,
    hookTimeout: 30_000,
    projects: testProjects,
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 30_000,
  },
};

export default defineConfig(config);
