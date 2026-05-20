import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineDevtoolsConfig, devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const isCloudflareBuild = process.env.CEIRD_CLOUDFLARE === "1";
const cloudflareWorkersEnvStub = fileURLToPath(
  new URL("src/test/cloudflare-workers.ts", import.meta.url)
);
export const appRouteFileIgnorePattern = "\\.test\\.(ts|tsx)$";
const devtoolsConfig = defineDevtoolsConfig({
  injectSource: {
    enabled: false,
  },
});

const config = defineConfig({
  build: isCloudflareBuild
    ? {
        rollupOptions: {
          external: ["cloudflare:workers", "node:async_hooks"],
        },
        target: "esnext",
      }
    : undefined,
  resolve: {
    alias: isCloudflareBuild
      ? []
      : [{ find: "cloudflare:workers", replacement: cloudflareWorkersEnvStub }],
    tsconfigPaths: true,
  },
  optimizeDeps: {
    include: [
      "@tanstack/history",
      "@tanstack/router-core",
      "@tanstack/router-core/ssr/client",
      "@tanstack/router-core/ssr/server",
      "h3-v2",
      "seroval",
    ],
  },
  plugins: [
    tanstackStart({
      router: {
        routeFileIgnorePattern: appRouteFileIgnorePattern,
      },
      server: {
        entry: "./src/server.ts",
      },
    }),
    devtools(devtoolsConfig),
    tailwindcss(),
    viteReact(),
  ],
});

export default config;
