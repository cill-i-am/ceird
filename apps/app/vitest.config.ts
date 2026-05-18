import { fileURLToPath } from "node:url";

import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

const cloudflareWorkersEnvStub = fileURLToPath(
  new URL("src/test/cloudflare-workers.ts", import.meta.url)
);

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ["./tsconfig.json"] }), viteReact()],
  resolve: {
    alias: [
      { find: "cloudflare:workers", replacement: cloudflareWorkersEnvStub },
    ],
  },
  test: {
    environment: "jsdom",
    fileParallelism: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: true,
    hookTimeout: 30_000,
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 30_000,
  },
});
