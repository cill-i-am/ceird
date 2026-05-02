import { defineConfig } from "oxlint";

import core from "./node_modules/ultracite/config/oxlint/core/index.mjs";
import react from "./node_modules/ultracite/config/oxlint/react/index.mjs";
import vitest from "./node_modules/ultracite/config/oxlint/vitest/index.mjs";

const vitestOverrides = (vitest.overrides ?? []).map((override) => ({
  ...override,
  rules: {
    ...override.rules,
    "vitest/prefer-importing-vitest-globals": "off",
  },
}));

export default defineConfig({
  ...core,
  env: {
    ...core.env,
    browser: true,
  },
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    ".agents/skills/**",
    ".agents/**",
    "opensrc/**",
    "apps/app/src/routeTree.gen.ts",
  ],
  overrides: [...(core.overrides ?? []), ...vitestOverrides],
  plugins: [
    ...new Set([
      ...(core.plugins ?? []),
      ...(react.plugins ?? []),
      ...(vitest.plugins ?? []),
    ]),
  ],
  rules: {
    ...core.rules,
    ...react.rules,
    ...vitest.rules,
    "func-names": "off",
    "func-style": "off",
    "no-use-before-define": "off",
    "promise/prefer-await-to-callbacks": "off",
    "react/no-danger": "off",
    "react-perf/jsx-no-new-function-as-prop": "off",
    "sort-keys": "off",
    "unicorn/text-encoding-identifier-case": "off",
    "unicorn/filename-case": "off",
    "unicorn/prefer-import-meta-properties": "off",
    "vitest/prefer-importing-vitest-globals": "off",
  },
});
