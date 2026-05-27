import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildOrganizationTenantOrigin,
  buildOrganizationTenantUrl,
  parseTenantHost,
  readTenantHostConfigFromEnv,
} from "./tenant-host";

describe("tenant host parsing", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

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

  it("does not parse or build tenant hosts from reserved organization slugs", () => {
    const config = {
      baseDomain: "ceird.app",
      hostMode: "production" as const,
      reservedHostnames: [],
    };

    expect(parseTenantHost("api.ceird.app", config)).toStrictEqual({
      kind: "system",
    });
    expect(buildOrganizationTenantOrigin("api", config)).toBeUndefined();
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

  it("rejects organization slug labels outside the shared length contract", () => {
    const config = {
      baseDomain: "ceird.app",
      hostMode: "production" as const,
      reservedHostnames: [],
    };

    expect(parseTenantHost("a.ceird.app", config)).toStrictEqual({
      kind: "system",
    });
    expect(
      parseTenantHost(`${"a".repeat(41)}.ceird.app`, config)
    ).toStrictEqual({
      kind: "system",
    });
    expect(
      buildOrganizationTenantOrigin("a", {
        baseDomain: "ceird.app",
        hostMode: "production",
        reservedHostnames: [],
      })
    ).toBeUndefined();
    expect(
      buildOrganizationTenantOrigin("a".repeat(41), {
        baseDomain: "ceird.app",
        hostMode: "production",
        reservedHostnames: [],
      })
    ).toBeUndefined();
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

  it("rejects URL-like and malformed host input", () => {
    const config = {
      baseDomain: "ceird.app",
      hostMode: "production" as const,
      reservedHostnames: [],
    };

    for (const hostname of [
      "https://acme.ceird.app",
      "https://evil.com@acme.ceird.app",
      "evil.com@acme.ceird.app",
      "acme.ceird.app/path",
      "acme.ceird.app?x=1",
      "acme.ceird.app#section",
      "acme.ceird.app:abc",
    ]) {
      expect(parseTenantHost(hostname, config)).toStrictEqual({
        kind: "system",
      });
    }
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

  it("does not build tenant origins that collide with configured reserved hosts", () => {
    expect(
      buildOrganizationTenantOrigin("acme-field-ops", {
        baseDomain: "ceird.app",
        hostMode: "production",
        reservedHostnames: ["acme-field-ops.ceird.app"],
      })
    ).toBeUndefined();
    expect(
      buildOrganizationTenantOrigin("acme-field-ops", {
        baseDomain: "ceird.app",
        hostMode: "stage",
        reservedHostnames: ["acme-field-ops--pr-123.ceird.app"],
        stageAlias: "pr-123",
      })
    ).toBeUndefined();
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

  it("does not build tenant URLs from absolute or protocol-relative inputs", () => {
    const config = {
      baseDomain: "ceird.app",
      hostMode: "stage" as const,
      reservedHostnames: [],
      stageAlias: "pr-123",
    };

    expect(
      buildOrganizationTenantUrl(
        "acme-field-ops",
        "https://evil.example/path",
        config
      )
    ).toBeUndefined();
    expect(
      buildOrganizationTenantUrl(
        "acme-field-ops",
        "//evil.example/path",
        config
      )
    ).toBeUndefined();
    expect(
      buildOrganizationTenantUrl("acme-field-ops", "relative/path", config)
    ).toBeUndefined();
    expect(
      buildOrganizationTenantUrl(
        "acme-field-ops",
        "/\\evil.example/path",
        config
      )
    ).toBeUndefined();
    expect(
      buildOrganizationTenantUrl(
        "acme-field-ops",
        "/\\/evil.example/path",
        config
      )
    ).toBeUndefined();
  });

  it("does not parse or build stage hosts with invalid stage aliases", () => {
    for (const stageAlias of [
      "bad/segment",
      "-bad",
      "bad-",
      "",
      "a".repeat(64),
    ]) {
      const config = {
        baseDomain: "ceird.app",
        hostMode: "stage" as const,
        reservedHostnames: [],
        stageAlias,
      };

      expect(
        parseTenantHost("acme-field-ops--bad.ceird.app", config)
      ).toStrictEqual({
        kind: "system",
      });
      expect(
        buildOrganizationTenantOrigin("acme-field-ops", config)
      ).toBeUndefined();
    }
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

  it("defaults unknown tenant host modes from env to disabled", () => {
    vi.stubEnv("VITE_TENANT_BASE_DOMAIN", "ceird.app");
    vi.stubEnv("VITE_TENANT_HOST_MODE", "unexpected");
    vi.stubEnv("VITE_TENANT_RESERVED_HOSTNAMES", "");

    expect(readTenantHostConfigFromEnv()).toStrictEqual({
      baseDomain: "ceird.app",
      hostMode: "disabled",
      reservedHostnames: [],
      stageAlias: undefined,
    });
  });
});
