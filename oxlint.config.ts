import { defineConfig } from "oxlint";

import core from "./node_modules/ultracite/config/oxlint/core/index.mjs";
import react from "./node_modules/ultracite/config/oxlint/react/index.mjs";
import vitest from "./node_modules/ultracite/config/oxlint/vitest/index.mjs";

const relaxedVitestRules = {
  "vitest/max-expects": "off",
  "vitest/prefer-mock-return-shorthand": "off",
  "vitest/prefer-importing-vitest-globals": "off",
};

const vitestOverrides = (vitest.overrides ?? []).map((override) => ({
  ...override,
  rules: {
    ...override.rules,
    ...relaxedVitestRules,
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
    "func-name-matching": "off",
    "jsx-a11y/control-has-associated-label": "off",
    "jsx-a11y/interactive-supports-focus": "off",
    "jsx-a11y/no-noninteractive-element-interactions": "off",
    "no-await-in-loop": "off",
    "no-implicit-globals": "off",
    "no-use-before-define": "off",
    "node/callback-return": "off",
    "prefer-arrow-callback": "off",
    "prefer-named-capture-group": "off",
    "promise/prefer-await-to-callbacks": "off",
    "react/no-danger": "off",
    "react/no-object-type-as-default-prop": "off",
    "react-perf/jsx-no-new-function-as-prop": "off",
    "require-unicode-regexp": "off",
    "sort-keys": "off",
    "typescript/method-signature-style": "off",
    "unicorn/consistent-function-scoping": "off",
    "unicorn/filename-case": "off",
    "unicorn/import-style": "off",
    "unicorn/prefer-import-meta-properties": "off",
    "unicorn/text-encoding-identifier-case": "off",
    ...relaxedVitestRules,
  },
});
