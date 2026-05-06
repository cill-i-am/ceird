import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

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
        entry: "./src/server.ts",
      },
    }),
    devtools(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    viteReact(),
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
