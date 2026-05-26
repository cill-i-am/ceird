import { describe, expect, it } from "@effect/vitest";

import {
  makeCloudflareTenantDnsRecordPayload,
  makeCloudflareTenantWorkerRoutePayload,
  validateTenantRoutePattern,
} from "./cloudflare-tenant-routing.ts";

describe("Cloudflare tenant routing", () => {
  it("builds the proxied wildcard A record payload", () => {
    expect(makeCloudflareTenantDnsRecordPayload("ceird.app")).toStrictEqual({
      content: "192.0.2.0",
      name: "*",
      proxied: true,
      ttl: 1,
      type: "A",
    });
  });

  it("builds Worker route payloads for tenant wildcard routes", () => {
    expect(
      makeCloudflareTenantWorkerRoutePayload({
        pattern: "*--pr-123.ceird.app/*",
        scriptName: "ceird-pr-123-app",
      })
    ).toStrictEqual({
      pattern: "*--pr-123.ceird.app/*",
      script: "ceird-pr-123-app",
    });
  });

  it("omits the script key for no-script bypass routes", () => {
    const payload = makeCloudflareTenantWorkerRoutePayload({
      pattern: "api.ceird.app/*",
      scriptName: undefined,
    });

    expect(payload).toStrictEqual({ pattern: "api.ceird.app/*" });
    expect(payload).not.toHaveProperty("script");
  });

  it("rejects wildcard tenant route patterns outside the zone", () => {
    expect(
      validateTenantRoutePattern({
        pattern: "*--pr-123.ceird.app/*",
        zoneName: "ceird.app",
      })
    ).toBe("*--pr-123.ceird.app/*");
    expect(
      validateTenantRoutePattern({
        pattern: "*.ceird.app/*",
        zoneName: "ceird.app",
      })
    ).toBe("*.ceird.app/*");
    expect(() =>
      validateTenantRoutePattern({
        pattern: "*--pr-123.evil.example/*",
        zoneName: "ceird.app",
      })
    ).toThrow(/must stay inside zone "ceird\.app"/);
  });

  it("does not apply wildcard validation to reserved exact bypass routes", () => {
    expect(
      validateTenantRoutePattern({
        pattern: "api.ceird.app/*",
        zoneName: "ceird.app",
      })
    ).toBe("api.ceird.app/*");
  });
});
