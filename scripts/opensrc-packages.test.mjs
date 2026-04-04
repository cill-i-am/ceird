import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOpensrcSourceList,
  shouldIncludeOpensrcPackage,
} from "./opensrc-packages.mjs";

test("includes runtime and framework packages in the opensrc source list", () => {
  const sourceList = buildOpensrcSourceList([
    {
      dependencies: {
        "@effect/platform": "^0.96.0",
        "@tanstack/react-form": "^1.28.6",
        "@tanstack/react-router": "latest",
        "@tanstack/react-router-ssr-query": "latest",
        "@tanstack/react-start": "latest",
        "better-auth": "^1.5.6",
        "drizzle-orm": "0.45.2",
        effect: "^3.21.0",
        pg: "8.20.0",
        react: "^19.2.0",
        "react-dom": "^19.2.0",
        tailwindcss: "^4.1.18",
      },
    },
  ]);

  assert.deepEqual(sourceList, [
    "@effect/platform",
    "@tanstack/react-form",
    "@tanstack/react-router",
    "@tanstack/react-router-ssr-query",
    "@tanstack/react-start",
    "better-auth",
    "drizzle-orm",
    "effect",
    "github:facebook/react",
    "pg",
    "portless",
    "react-dom",
    "tailwindcss",
  ]);
});

test("excludes assets, lightweight helpers, build tooling, and workspace packages", () => {
  const sourceList = buildOpensrcSourceList([
    {
      dependencies: {
        "@fontsource-variable/geist": "^5.2.8",
        "@hugeicons/react": "^1.1.6",
        "@tanstack/react-devtools": "latest",
        "@tanstack/react-router-devtools": "latest",
        "@tanstack/router-plugin": "^1.132.0",
        "@tailwindcss/vite": "^4.1.18",
        "@task-tracker/sandbox-core": "workspace:*",
        "class-variance-authority": "^0.7.1",
        clsx: "^2.1.1",
        react: "^19.2.0",
        "tailwind-merge": "^3.5.0",
        "tw-animate-css": "^1.4.0",
      },
    },
  ]);

  assert.deepEqual(sourceList, ["github:facebook/react", "portless"]);
});

test("matches allowed packages by exact name or approved scope prefix", () => {
  assert.equal(shouldIncludeOpensrcPackage("@effect/sql"), true);
  assert.equal(shouldIncludeOpensrcPackage("@tanstack/react-start"), true);
  assert.equal(shouldIncludeOpensrcPackage("@tanstack/router-plugin"), false);
  assert.equal(shouldIncludeOpensrcPackage("tailwindcss"), true);
  assert.equal(
    shouldIncludeOpensrcPackage("@fontsource-variable/raleway"),
    false
  );
  assert.equal(shouldIncludeOpensrcPackage("@tailwindcss/vite"), false);
  assert.equal(shouldIncludeOpensrcPackage("clsx"), false);
});
