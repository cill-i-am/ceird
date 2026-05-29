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
const hugeiconsTreeShakableEntry = fileURLToPath(
  new URL(
    "node_modules/@hugeicons/core-free-icons/dist/esm/index.js",
    import.meta.url
  )
);
const CEIRD_DOMAIN_PACKAGE_PATTERN =
  /\/packages\/(?:agents-core|identity-core|jobs-core|sites-core)\/src\//;
export const appRouteFileIgnorePattern = "\\.test\\.(ts|tsx)$";
const devtoolsConfig = defineDevtoolsConfig({
  injectSource: {
    enabled: false,
  },
});

const config = defineConfig({
  build: {
    rollupOptions: {
      external: isCloudflareBuild
        ? ["cloudflare:workers", "node:async_hooks"]
        : undefined,
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/effect/")) {
            return "effect";
          }

          if (CEIRD_DOMAIN_PACKAGE_PATTERN.test(id)) {
            return "ceird-domain";
          }
        },
      },
    },
    target: isCloudflareBuild ? "esnext" : undefined,
  },
  resolve: {
    alias: [
      {
        find: "@hugeicons/core-free-icons",
        replacement: hugeiconsTreeShakableEntry,
      },
      ...(isCloudflareBuild
        ? []
        : [
            {
              find: "cloudflare:workers",
              replacement: cloudflareWorkersEnvStub,
            },
          ]),
    ],
    tsconfigPaths: true,
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
