import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    globals: true,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
