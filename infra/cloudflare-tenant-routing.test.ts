import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import { Unowned } from "alchemy/AdoptPolicy";
import * as Cloudflare from "alchemy/Cloudflare";
import { findProviderByType } from "alchemy/Provider";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import {
  makeCloudflareTenantDnsRecordPayload,
  makeCloudflareTenantWorkerRoutePayload,
  TenantWildcardDnsRecordProvider,
  TenantWorkerRouteProvider,
  validateTenantRoutePattern,
} from "./cloudflare-tenant-routing.ts";
import type {
  TenantWildcardDnsRecord,
  TenantWorkerRoute,
} from "./cloudflare-tenant-routing.ts";

const cloudflareApiBaseUrl = "https://cloudflare.test/client/v4";

interface CloudflareTestRequest {
  readonly body: unknown;
  readonly method: string;
  readonly url: URL;
}

function makeCloudflareFetchMock(
  handler: (request: CloudflareTestRequest) => unknown
) {
  const requests: CloudflareTestRequest[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(getRequestUrl(input));
    const method =
      init?.method ?? (input instanceof Request ? input.method : "GET");
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const request = { body, method, url };

    requests.push(request);

    return Promise.resolve(Response.json(handler(request)));
  });

  return { fetchMock, requests };
}

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

async function runTenantRoutingEffect<A, Error, Requirements>(
  effect: Effect.Effect<A, Error, Requirements>
) {
  return await Effect.runPromise(
    effect.pipe(
      Effect.provide(TenantWildcardDnsRecordProvider()),
      Effect.provide(TenantWorkerRouteProvider()),
      Effect.provideService(Cloudflare.CloudflareEnvironment, {
        accountId: "account-id",
        apiToken: Redacted.make("environment-token"),
        source: { type: "env" },
        type: "apiToken",
      }),
      Effect.provideService(
        Cloudflare.Credentials,
        Effect.succeed({
          apiBaseUrl: cloudflareApiBaseUrl,
          apiToken: Redacted.make("api-token"),
          type: "apiToken",
        })
      )
    ) as Effect.Effect<A, Error, never>
  );
}

function matchingZoneResponse() {
  return {
    result: [
      {
        account: { id: "account-id" },
        id: "zone-id",
        name: "ceird.app",
      },
    ],
    success: true,
  };
}

describe("Cloudflare tenant routing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("marks existing unowned wildcard DNS records as foreign", async () => {
    const { fetchMock } = makeCloudflareFetchMock((request) => {
      if (request.url.pathname === "/client/v4/zones") {
        return matchingZoneResponse();
      }

      expect(request.url.pathname).toBe("/client/v4/zones/zone-id/dns_records");
      expect(request.url.searchParams.get("name.exact")).toBe("*.ceird.app");

      return {
        result: [
          {
            content: "203.0.113.10",
            id: "dns-foreign",
            name: "*.ceird.app",
            proxied: false,
            tags: [],
            ttl: 1,
            type: "A",
          },
        ],
        success: true,
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runTenantRoutingEffect(
      Effect.gen(function* () {
        const provider = yield* findProviderByType<TenantWildcardDnsRecord>(
          "Ceird.CloudflareTenantWildcardDnsRecord"
        );
        if (!provider.read) {
          return yield* Effect.die("Tenant wildcard DNS provider needs read.");
        }

        return yield* provider.read({
          id: "TenantWildcardDnsRecord",
          instanceId: "instance-id",
          olds: { zoneName: "ceird.app" },
          output: undefined,
        });
      })
    );

    expect(result).toMatchObject({
      recordId: "dns-foreign",
      zoneId: "zone-id",
      zoneName: "ceird.app",
    });
    expect(Unowned.is(result)).toBe(true);
  });

  it("refuses to overwrite existing unowned wildcard DNS records", async () => {
    const { fetchMock, requests } = makeCloudflareFetchMock((request) => {
      if (request.url.pathname === "/client/v4/zones") {
        return matchingZoneResponse();
      }

      expect(request.url.pathname).toBe("/client/v4/zones/zone-id/dns_records");

      return {
        result: [
          {
            content: "203.0.113.10",
            id: "dns-foreign",
            name: "*.ceird.app",
            proxied: false,
            tags: [],
            ttl: 1,
            type: "A",
          },
        ],
        success: true,
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runTenantRoutingEffect(
        Effect.gen(function* () {
          const provider = yield* findProviderByType<TenantWildcardDnsRecord>(
            "Ceird.CloudflareTenantWildcardDnsRecord"
          );

          return yield* provider.reconcile({
            bindings: [],
            id: "TenantWildcardDnsRecord",
            instanceId: "instance-id",
            news: { zoneName: "ceird.app" },
            olds: undefined,
            output: undefined,
            session: {} as never,
          });
        })
      )
    ).rejects.toThrow(/not managed by Ceird Alchemy tenant routing/);
    expect(requests.map((request) => request.method)).not.toContain("POST");
    expect(requests.map((request) => request.method)).not.toContain("PUT");
  });

  it("creates managed wildcard DNS records and never deletes the shared wildcard", async () => {
    const { fetchMock, requests } = makeCloudflareFetchMock((request) => {
      if (request.url.pathname === "/client/v4/zones") {
        return matchingZoneResponse();
      }

      if (
        request.method === "GET" &&
        request.url.pathname === "/client/v4/zones/zone-id/dns_records"
      ) {
        return { result: [], success: true };
      }

      expect(request.method).toBe("POST");
      expect(request.url.pathname).toBe("/client/v4/zones/zone-id/dns_records");
      expect(request.body).toMatchObject({
        content: "192.0.2.0",
        name: "*",
        proxied: true,
        tags: ["app:ceird", "managed_by:alchemy", "purpose:tenant-wildcard"],
        ttl: 1,
        type: "A",
      });

      return {
        result: {
          id: "dns-managed",
          name: "*.ceird.app",
          ...(request.body as Record<string, unknown>),
        },
        success: true,
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = await runTenantRoutingEffect(
      findProviderByType<TenantWildcardDnsRecord>(
        "Ceird.CloudflareTenantWildcardDnsRecord"
      )
    );

    await runTenantRoutingEffect(
      provider.reconcile({
        bindings: [],
        id: "TenantWildcardDnsRecord",
        instanceId: "instance-id",
        news: { zoneName: "ceird.app" },
        olds: undefined,
        output: undefined,
        session: {} as never,
      })
    );
    requests.splice(0);

    if (!provider.delete) {
      throw new Error("Tenant wildcard DNS provider needs delete.");
    }

    await runTenantRoutingEffect(
      provider.delete({
        bindings: [],
        id: "TenantWildcardDnsRecord",
        instanceId: "instance-id",
        olds: { zoneName: "ceird.app" },
        output: {
          recordId: "dns-managed",
          zoneId: "zone-id",
          zoneName: "ceird.app",
        },
        session: {} as never,
      })
    );

    expect(requests).toStrictEqual([]);
  });

  it("marks existing Worker routes as foreign when there is no saved state", async () => {
    const { fetchMock } = makeCloudflareFetchMock((request) => {
      if (request.url.pathname === "/client/v4/zones") {
        return matchingZoneResponse();
      }

      expect(request.url.pathname).toBe(
        "/client/v4/zones/zone-id/workers/routes"
      );

      return {
        result: [
          {
            id: "route-foreign",
            pattern: "*.ceird.app/*",
            script: "another-worker",
          },
        ],
        success: true,
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runTenantRoutingEffect(
      Effect.gen(function* () {
        const provider = yield* findProviderByType<TenantWorkerRoute>(
          "Ceird.CloudflareTenantWorkerRoute"
        );
        if (!provider.read) {
          return yield* Effect.die("Tenant Worker route provider needs read.");
        }

        return yield* provider.read({
          id: "TenantWorkerRoute",
          instanceId: "instance-id",
          olds: {
            pattern: "*.ceird.app/*",
            scriptName: "ceird-main-app",
            zoneName: "ceird.app",
          },
          output: undefined,
        });
      })
    );

    expect(result).toMatchObject({
      pattern: "*.ceird.app/*",
      routeId: "route-foreign",
      scriptName: "another-worker",
      zoneId: "zone-id",
    });
    expect(Unowned.is(result)).toBe(true);
  });

  it("refuses to reassign existing Worker routes without saved state", async () => {
    const { fetchMock, requests } = makeCloudflareFetchMock((request) => {
      if (request.url.pathname === "/client/v4/zones") {
        return matchingZoneResponse();
      }

      expect(request.url.pathname).toBe(
        "/client/v4/zones/zone-id/workers/routes"
      );

      return {
        result: [
          {
            id: "route-foreign",
            pattern: "*.ceird.app/*",
            script: "another-worker",
          },
        ],
        success: true,
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runTenantRoutingEffect(
        Effect.gen(function* () {
          const provider = yield* findProviderByType<TenantWorkerRoute>(
            "Ceird.CloudflareTenantWorkerRoute"
          );

          return yield* provider.reconcile({
            bindings: [],
            id: "TenantWorkerRoute",
            instanceId: "instance-id",
            news: {
              pattern: "*.ceird.app/*",
              scriptName: "ceird-main-app",
              zoneName: "ceird.app",
            },
            olds: undefined,
            output: undefined,
            session: {} as never,
          });
        })
      )
    ).rejects.toThrow(/already exists in zone "ceird\.app"/);
    expect(requests.map((request) => request.method)).not.toContain("POST");
    expect(requests.map((request) => request.method)).not.toContain("PUT");
  });

  it("updates saved no-script bypass routes without adding a script key", async () => {
    const { fetchMock, requests } = makeCloudflareFetchMock((request) => {
      if (request.url.pathname === "/client/v4/zones") {
        return matchingZoneResponse();
      }

      if (request.method === "GET") {
        expect(request.url.pathname).toBe(
          "/client/v4/zones/zone-id/workers/routes/route-managed"
        );

        return {
          result: {
            id: "route-managed",
            pattern: "api.ceird.app/*",
            script: "old-worker",
          },
          success: true,
        };
      }

      expect(request.method).toBe("PUT");
      expect(request.url.pathname).toBe(
        "/client/v4/zones/zone-id/workers/routes/route-managed"
      );
      expect(request.body).toStrictEqual({ pattern: "api.ceird.app/*" });

      return {
        result: {
          id: "route-managed",
          pattern: "api.ceird.app/*",
          script: null,
        },
        success: true,
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await runTenantRoutingEffect(
      Effect.gen(function* () {
        const provider = yield* findProviderByType<TenantWorkerRoute>(
          "Ceird.CloudflareTenantWorkerRoute"
        );

        return yield* provider.reconcile({
          bindings: [],
          id: "TenantReservedHostBypassRoute0",
          instanceId: "instance-id",
          news: {
            pattern: "api.ceird.app/*",
            scriptName: undefined,
            zoneName: "ceird.app",
          },
          olds: {
            pattern: "api.ceird.app/*",
            scriptName: undefined,
            zoneName: "ceird.app",
          },
          output: {
            pattern: "api.ceird.app/*",
            routeId: "route-managed",
            scriptName: "old-worker",
            zoneId: "zone-id",
          },
          session: {} as never,
        });
      })
    );

    expect(requests.map((request) => request.method)).toStrictEqual([
      "GET",
      "GET",
      "PUT",
    ]);
  });
});
