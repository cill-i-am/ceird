import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  apiWorkerCompatibility,
  appWorkerCompatibility,
} from "./cloudflare-stack.ts";

describe("Cloudflare Worker compatibility", () => {
  it("keeps the API on full Node.js compatibility", () => {
    expect(apiWorkerCompatibility).toStrictEqual({
      date: "2026-04-30",
      flags: ["nodejs_compat"],
    });
  });

  it("keeps the app Worker on full Node.js compatibility", () => {
    expect(appWorkerCompatibility).toStrictEqual({
      date: "2026-04-30",
      flags: ["nodejs_compat"],
    });
  });

  it("keeps both Cloudflare Rolldown plugin copies patched for Worker startup", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8")
    ) as {
      pnpm?: {
        patchedDependencies?: Record<string, string>;
      };
    };

    expect(packageJson.pnpm?.patchedDependencies).toMatchObject({
      "@distilled.cloud/cloudflare-rolldown-plugin@0.2.0":
        "patches/@distilled.cloud__cloudflare-rolldown-plugin@0.2.0.patch",
      "@distilled.cloud/cloudflare-rolldown-plugin@0.3.0":
        "patches/@distilled.cloud__cloudflare-rolldown-plugin@0.3.0.patch",
    });
  });
});
