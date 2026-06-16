import { describe, expect, it, vi } from "vitest";

import { resolveSyncOrigin } from "./sync-origin";

const stageTenantConfig = {
  baseDomain: "ceird.app",
  hostMode: "stage" as const,
  reservedHostnames: ["app.pr-227.ceird.app", "sync.pr-227.ceird.app"],
  stageAlias: "pr-227",
};

describe("sync origin resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers the configured Sync origin", () => {
    expect(
      resolveSyncOrigin(
        "https://app.pr-227.ceird.app",
        "https://sync.configured.example"
      )
    ).toBe("https://sync.configured.example");
  }, 1000);

  it("keeps invalid configured Sync origins visible to the Electric validator", () => {
    expect(
      resolveSyncOrigin(
        "https://app.pr-227.ceird.app",
        "https://user:secret@sync.example"
      )
    ).toBe("https://user:secret@sync.example");
  }, 1000);

  it("maps app stage hosts to the matching Sync Worker", () => {
    expect(resolveSyncOrigin("https://app.pr-227.ceird.app")).toBe(
      "https://sync.pr-227.ceird.app"
    );
  }, 1000);

  it("maps tenant stage hosts to the matching Sync Worker", () => {
    expect(
      resolveSyncOrigin(
        "https://acme-field-ops--pr-227.ceird.app",
        undefined,
        stageTenantConfig
      )
    ).toBe("https://sync.pr-227.ceird.app");
  }, 1000);

  it("maps production tenant hosts to the production Sync Worker", () => {
    expect(
      resolveSyncOrigin("https://acme-field-ops.ceird.app", undefined, {
        baseDomain: "ceird.app",
        hostMode: "production",
        reservedHostnames: ["app.ceird.app", "sync.ceird.app"],
      })
    ).toBe("https://sync.ceird.app");
  }, 1000);

  it("returns undefined when the origin is not a Ceird app or tenant host", () => {
    expect(
      resolveSyncOrigin("https://example.com", undefined, stageTenantConfig)
    ).toBeUndefined();
  }, 1000);
});
