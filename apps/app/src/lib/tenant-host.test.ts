import { describe, expect, it, vi } from "vitest";

import {
  buildOrganizationTenantOrigin,
  buildOrganizationTenantUrl,
  parseTenantHost,
  readTenantHostConfigFromEnv,
} from "./tenant-host";

describe("tenant host parsing", () => {
  it("parses production tenant hosts", () => {
    expect(
      parseTenantHost("acme-field-ops.ceird.app", {
        baseDomain: "ceird.app",
        hostMode: "production",
        reservedHostnames: ["app.ceird.app", "api.ceird.app"],
      })
    ).toStrictEqual({ kind: "tenant", organizationSlug: "acme-field-ops" });
  });

  it("does not treat reserved production hosts as tenants", () => {
    expect(
      parseTenantHost("app.ceird.app", {
        baseDomain: "ceird.app",
        hostMode: "production",
        reservedHostnames: ["app.ceird.app", "api.ceird.app"],
      })
    ).toStrictEqual({ kind: "system" });
  });

  it("parses stage tenant hosts", () => {
    expect(
      parseTenantHost("acme-field-ops--pr-123.ceird.app", {
        baseDomain: "ceird.app",
        hostMode: "stage",
        reservedHostnames: ["app.pr-123.ceird.app", "api.pr-123.ceird.app"],
        stageAlias: "pr-123",
      })
    ).toStrictEqual({ kind: "tenant", organizationSlug: "acme-field-ops" });
  });

  it("treats stage system hosts as system hosts", () => {
    expect(
      parseTenantHost("app.pr-123.ceird.app", {
        baseDomain: "ceird.app",
        hostMode: "stage",
        reservedHostnames: ["app.pr-123.ceird.app", "api.pr-123.ceird.app"],
        stageAlias: "pr-123",
      })
    ).toStrictEqual({ kind: "system" });
  });

  it("does not parse stage tenant hosts without a stage alias", () => {
    expect(
      parseTenantHost("acme-field-ops--pr-123.ceird.app", {
        baseDomain: "ceird.app",
        hostMode: "stage",
        reservedHostnames: [],
      })
    ).toStrictEqual({ kind: "system" });
  });

  it("rejects non-matching hosts and nested labels", () => {
    const config = {
      baseDomain: "ceird.app",
      hostMode: "production" as const,
      reservedHostnames: [],
    };

    expect(parseTenantHost("acme.example.com", config)).toStrictEqual({
      kind: "system",
    });
    expect(parseTenantHost("nested.acme.ceird.app", config)).toStrictEqual({
      kind: "system",
    });
  });

  it("rejects invalid organization slug labels", () => {
    const config = {
      baseDomain: "ceird.app",
      hostMode: "production" as const,
      reservedHostnames: [],
    };

    expect(parseTenantHost("-acme.ceird.app", config)).toStrictEqual({
      kind: "system",
    });
    expect(parseTenantHost("acme-.ceird.app", config)).toStrictEqual({
      kind: "system",
    });
    expect(parseTenantHost("acme_field_ops.ceird.app", config)).toStrictEqual({
      kind: "system",
    });
  });

  it("normalizes case and strips ports before parsing", () => {
    expect(
      parseTenantHost("Acme-Field-Ops.Ceird.App:443", {
        baseDomain: "ceird.app",
        hostMode: "production",
        reservedHostnames: [],
      })
    ).toStrictEqual({ kind: "tenant", organizationSlug: "acme-field-ops" });
  });

  it("builds stage tenant origins", () => {
    expect(
      buildOrganizationTenantOrigin("acme-field-ops", {
        baseDomain: "ceird.app",
        hostMode: "stage",
        reservedHostnames: [],
        stageAlias: "pr-123",
      })
    ).toBe("https://acme-field-ops--pr-123.ceird.app");
  });

  it("builds tenant URLs while preserving path, search, and hash", () => {
    expect(
      buildOrganizationTenantUrl(
        "acme-field-ops",
        "/projects/42?tab=timeline#activity",
        {
          baseDomain: "ceird.app",
          hostMode: "stage",
          reservedHostnames: [],
          stageAlias: "pr-123",
        }
      )
    ).toBe(
      "https://acme-field-ops--pr-123.ceird.app/projects/42?tab=timeline#activity"
    );
  });

  it("does not build tenant origins when disabled", () => {
    expect(
      buildOrganizationTenantOrigin("acme-field-ops", {
        baseDomain: "ceird.app",
        hostMode: "disabled",
        reservedHostnames: [],
      })
    ).toBeUndefined();
  });

  it("disables tenant hosts for localhost mode", () => {
    expect(
      parseTenantHost("127.0.0.1", {
        baseDomain: "ceird.app",
        hostMode: "disabled",
        reservedHostnames: [],
      })
    ).toStrictEqual({ kind: "disabled" });
  });

  it("reads tenant host config from Vite env", () => {
    vi.stubEnv("VITE_TENANT_BASE_DOMAIN", "ceird.app");
    vi.stubEnv("VITE_TENANT_HOST_MODE", "stage");
    vi.stubEnv(
      "VITE_TENANT_RESERVED_HOSTNAMES",
      "app.pr-123.ceird.app, api.pr-123.ceird.app"
    );
    vi.stubEnv("VITE_TENANT_STAGE_ALIAS", "pr-123");

    expect(readTenantHostConfigFromEnv()).toStrictEqual({
      baseDomain: "ceird.app",
      hostMode: "stage",
      reservedHostnames: ["app.pr-123.ceird.app", "api.pr-123.ceird.app"],
      stageAlias: "pr-123",
    });
  });
});
