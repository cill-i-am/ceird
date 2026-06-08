import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const cloudflareWorkersStub = fileURLToPath(
  new URL("src/test/cloudflare-workers.ts", import.meta.url)
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "cloudflare:workers",
        replacement: cloudflareWorkersStub,
      },
    ],
  },
  test: {
    environment: "node",
  },
});
