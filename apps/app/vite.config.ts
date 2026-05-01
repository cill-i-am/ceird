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
const isCloudflareBuild =
  process.env.CEIRD_CLOUDFLARE === "1" ||
  process.env.TASK_TRACKER_CLOUDFLARE === "1";

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
    devtools(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
