// @vitest-environment node
import type { Plugin, UserConfig } from "vite";

import config, { appRouteFileIgnorePattern } from "../vite.config";

describe("app vite config", () => {
  it("keeps TanStack Devtools from injecting DOM source attributes", () => {
    const plugin = findPlugin(config, "@tanstack/devtools:inject-source");

    expect(plugin).toBeDefined();
    expect(doesPluginApplyInDevelopment(plugin)).toBeFalsy();
  });

  it("excludes route test files from TanStack route generation", () => {
    const ignorePattern = new RegExp(appRouteFileIgnorePattern);

    expect("health.test.ts").toMatch(ignorePattern);
    expect("oauth.consent.test.tsx").toMatch(ignorePattern);
    expect("__root.tsx").not.toMatch(ignorePattern);
    expect("_app._org.jobs.tsx").not.toMatch(ignorePattern);
  });

  it("lets Vite and Alchemy own API origin env injection", () => {
    expect(config.define ?? {}).not.toHaveProperty("__SERVER_API_ORIGIN__");
    expect(config.define ?? {}).not.toHaveProperty(
      "import.meta.env.VITE_API_ORIGIN"
    );
  });
});

function findPlugin(viteConfig: UserConfig, name: string): Plugin | undefined {
  return flattenPlugins(viteConfig.plugins).find(
    (plugin) => plugin.name === name
  );
}

function flattenPlugins(
  plugins: UserConfig["plugins"] = []
): readonly Plugin[] {
  const flattenedPlugins: Plugin[] = [];

  for (const plugin of plugins) {
    if (!plugin) {
      continue;
    }

    if (Array.isArray(plugin)) {
      flattenedPlugins.push(...flattenPlugins(plugin));
      continue;
    }

    if (typeof plugin === "object" && "name" in plugin) {
      flattenedPlugins.push(plugin);
    }
  }

  return flattenedPlugins;
}

function doesPluginApplyInDevelopment(plugin: Plugin | undefined) {
  if (!plugin) {
    return false;
  }

  if (typeof plugin.apply !== "function") {
    return plugin.apply !== "build";
  }

  return plugin.apply(
    {
      mode: "development",
    } as Parameters<typeof plugin.apply>[0],
    {
      command: "serve",
      mode: "development",
    }
  );
}
