import { fileURLToPath } from "node:url";

import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { UserConfig } from "vite";
import type { InlineConfig as VitestInlineConfig } from "vitest/node";

const cloudflareWorkersEnvStub = fileURLToPath(
  new URL("src/test/cloudflare-workers.ts", import.meta.url)
);

const config = {
  plugins: [viteReact()],
  resolve: {
    alias: [
      { find: "cloudflare:workers", replacement: cloudflareWorkersEnvStub },
    ],
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    fileParallelism: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: true,
    hookTimeout: 30_000,
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 30_000,
  } satisfies VitestInlineConfig,
} satisfies UserConfig & { readonly test: VitestInlineConfig };

export default defineConfig(config);
