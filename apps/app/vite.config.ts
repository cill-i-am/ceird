import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const serverApiOrigin =
  typeof process.env.API_ORIGIN === "string" ? process.env.API_ORIGIN : null;

const config = defineConfig({
  define: {
    __SERVER_API_ORIGIN__: JSON.stringify(serverApiOrigin),
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
