import { describe, expect, it } from "vitest";

import { applyCloudflareCreateRequireRuntimeFallback } from "../lib/cloudflare-create-require-runtime";

describe("Cloudflare createRequire runtime fallback", () => {
  it("adds a file URL fallback for Rolldown createRequire runtime helpers", () => {
    const output = applyCloudflareCreateRequireRuntimeFallback(
      [
        'import { createRequire } from "node:module";',
        "var __require = /* @__PURE__ */ createRequire(import.meta.url);",
      ].join("\n")
    );

    expect(output).toContain(
      'createRequire(import.meta.url ?? "file:///worker.js")'
    );
    expect(output).not.toContain("createRequire(import.meta.url);");
  });

  it("leaves chunks without the Rolldown helper unchanged", () => {
    const code = "export const value = import.meta.url;";

    expect(applyCloudflareCreateRequireRuntimeFallback(code)).toBe(code);
  });
});
