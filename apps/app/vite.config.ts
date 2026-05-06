import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { applyCloudflareCreateRequireRuntimeFallback } from "./src/lib/cloudflare-create-require-runtime";
import { tanstackStartServerEntry } from "./src/lib/tanstack-start-config";

const serverApiOrigin =
  typeof process.env.API_ORIGIN === "string" ? process.env.API_ORIGIN : null;
const clientApiOrigin =
  typeof process.env.VITE_API_ORIGIN === "string"
    ? process.env.VITE_API_ORIGIN
    : serverApiOrigin;
const isCloudflareBuild = process.env.CEIRD_CLOUDFLARE === "1";
const shouldUploadSentrySourceMaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT
);
const sentryRelease = process.env.SENTRY_RELEASE;

function cloudflareCreateRequireRuntimeFallbackPlugin(): Plugin {
  return {
    name: "ceird:cloudflare-create-require-runtime-fallback",
    apply: "build",
    applyToEnvironment(environment) {
      return isCloudflareBuild && environment.name === "ssr";
    },
    generateBundle(_outputOptions, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk") {
          continue;
        }
        item.code = applyCloudflareCreateRequireRuntimeFallback(item.code);
      }
    },
  };
}

const config = defineConfig({
  build: isCloudflareBuild
    ? {
        rollupOptions: {
          external: ["cloudflare:workers", "node:async_hooks"],
        },
        target: "esnext",
      }
    : undefined,
  define: {
    __SERVER_API_ORIGIN__: JSON.stringify(serverApiOrigin),
    "import.meta.env.VITE_API_ORIGIN": JSON.stringify(clientApiOrigin),
  },
  plugins: [
    tanstackStart({
      server: {
        entry: tanstackStartServerEntry,
      },
    }),
    devtools(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    viteReact(),
    cloudflareCreateRequireRuntimeFallbackPlugin(),
    sentryTanstackStart({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      release:
        shouldUploadSentrySourceMaps && sentryRelease
          ? {
              create: true,
              deploy: {
                env: "production",
              },
              finalize: true,
              inject: true,
              name: sentryRelease,
              setCommits: {
                auto: true,
                ignoreEmpty: true,
                ignoreMissing: true,
              },
            }
          : undefined,
      silent: !shouldUploadSentrySourceMaps,
      sourcemaps: {
        disable: !shouldUploadSentrySourceMaps,
      },
      telemetry: false,
    }),
  ],
});

export default config;
