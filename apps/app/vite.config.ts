import tailwindcss from "@tailwindcss/vite";
import { defineDevtoolsConfig, devtools } from "@tanstack/devtools-vite";
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
  define: {
    __SERVER_API_ORIGIN__: JSON.stringify(serverApiOrigin),
    "import.meta.env.VITE_API_ORIGIN": JSON.stringify(clientApiOrigin),
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
      server: {
        entry: "./src/server.ts",
      },
    }),
    devtools(devtoolsConfig),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    viteReact(),
  ],
});

export default config;
