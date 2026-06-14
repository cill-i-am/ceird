import type { mcpHandler as betterAuthMcpHandler } from "@better-auth/oauth-provider";
import { beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Logger, References } from "effect";
import type { Context } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { vi } from "vitest";

import { DomainDrizzle } from "../../platform/database/database.js";
import {
  configProviderFromMap,
  effectEither,
  withConfigProvider,
} from "../../test/effect-test-helpers.js";
import { makeAuthenticationConfig } from "../identity/authentication/config.js";
import { SiteLocationProvider } from "../sites/location-provider.js";
import { loadMcpAuthorizedAppCacheOptions } from "./cache-config.js";
import {
  disposeMcpAuthorizedAppCache,
  makeMcpAuthorizedAppCache,
  makeMcpWebHandler,
} from "./http.js";

type BetterAuthMcpHandler = typeof betterAuthMcpHandler;
type McpWebHandler = (
  request: Request
) => Response | Promise<Response | null> | null;
const { mcpHandlerMock } = vi.hoisted(() => ({
  mcpHandlerMock: vi.fn<BetterAuthMcpHandler>(),
}));

vi.mock(import("@better-auth/oauth-provider"), () => ({
  mcpHandler: mcpHandlerMock,
}));

describe("mcp http handler", () => {
  beforeEach(() => {
    mcpHandlerMock.mockReset();
    mcpHandlerMock.mockImplementation(
      () => () => Promise.resolve(new Response(null, { status: 204 }))
    );
  });

  it("serves protected resource metadata at both well-known paths", async () => {
    const authConfig = makeAuthenticationConfig({
      appOrigin: "https://app.ceird.example",
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const handler = makeMcpWebHandler({
      authConfig,
      runtimeLive: Layer.mergeAll(
        makeSuccessfulLabelListSqlLayer(),
        SiteLocationProvider.Development
      ),
    });

    const rootResponse = await handler(
      new Request(
        "https://api.ceird.example/.well-known/oauth-protected-resource"
      )
    );
    expect(rootResponse?.status).toBe(200);
    const rootBody = (await rootResponse?.json()) as
      | Record<string, unknown>
      | undefined;
    expect(rootBody).toMatchObject({
      resource: "https://api.ceird.example/mcp",
      authorization_servers: ["https://api.ceird.example/api/auth"],
    });

    const mcpResponse = await handler(
      new Request(
        "https://api.ceird.example/.well-known/oauth-protected-resource/mcp"
      )
    );
    expect(mcpResponse?.status).toBe(200);
  }, 10_000);

  it("returns 401 with resource metadata hint when bearer auth is missing", async () => {
    const authConfig = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const handler = makeMcpWebHandler({ authConfig });

    const response = await handler(
      new Request("http://127.0.0.1:3000/mcp", { method: "POST" })
    );

    expect(response?.status).toBe(401);
    expect(response?.headers.get("WWW-Authenticate")).toContain(
      'resource_metadata="http://127.0.0.1:3000/.well-known/oauth-protected-resource/mcp"'
    );
  }, 10_000);

  it("rejects Ceird-scoped bearer tokens without a consented workspace claim", async () => {
    mcpHandlerMock.mockImplementation(
      (_verifyOptions, handler) => (request: Request) =>
        Promise.resolve(
          handler(request, {
            client_id: "mcp-client",
            exp: Math.floor(Date.now() / 1000) + 300,
            scope: "ceird:read",
            sid: "session_abc",
            sub: "user_abc",
          })
        )
    );
    const authConfig = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const handler = makeMcpWebHandler({ authConfig });

    const response = await handler(
      new Request("http://127.0.0.1:3000/mcp", {
        headers: makeAuthorizedMcpHeaders(),
        method: "POST",
      })
    );

    expect(response?.status).toBe(401);
    expect(response?.headers.get("WWW-Authenticate")).toContain(
      'error="invalid_token"'
    );
  }, 10_000);

  it("falls back when the path is not owned by mcp", async () => {
    const authConfig = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const handler = makeMcpWebHandler({
      authConfig,
      runtimeLive: Layer.mergeAll(
        makeSuccessfulLabelListSqlLayer(),
        SiteLocationProvider.Development
      ),
    });

    const response = await handler(new Request("http://127.0.0.1:3000/jobs"));
    expect(response).toBeNull();
  }, 10_000);

  it("derives MCP and well-known metadata paths from a custom resource URL path", async () => {
    const authConfig = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      mcpResourceUrl: "https://api.ceird.example/agent/mcp",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const handler = makeMcpWebHandler({ authConfig });

    const customMcpPathResponse = await handler(
      new Request("https://api.ceird.example/agent/mcp", { method: "POST" })
    );
    expect(customMcpPathResponse?.status).toBe(401);
    expect(customMcpPathResponse?.headers.get("WWW-Authenticate")).toContain(
      'resource_metadata="https://api.ceird.example/.well-known/oauth-protected-resource/agent/mcp"'
    );

    const metadataResponse = await handler(
      new Request(
        "https://api.ceird.example/.well-known/oauth-protected-resource/agent/mcp"
      )
    );
    expect(metadataResponse?.status).toBe(200);
    await expect(metadataResponse?.json()).resolves.toMatchObject({
      resource: "https://api.ceird.example/agent/mcp",
      authorization_servers: ["https://api.ceird.example/api/auth"],
    });

    const oldMcpPathResponse = await handler(
      new Request("https://api.ceird.example/mcp", { method: "POST" })
    );
    expect(oldMcpPathResponse).toBeNull();
  }, 10_000);

  it("wires OAuth token verification with configured issuer and audience", () => {
    const authConfig = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      mcpResourceUrl: "https://api.ceird.example/agent/mcp",
      oauthIssuerUrl: "https://auth.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });

    makeMcpWebHandler({ authConfig });

    expect(mcpHandlerMock).toHaveBeenCalledExactlyOnceWith(
      {
        verifyOptions: {
          audience: "https://api.ceird.example/agent/mcp",
          issuer: "https://auth.ceird.example/api/auth",
        },
        jwksUrl: "https://auth.ceird.example/api/auth/jwks",
      },
      expect.any(Function),
      {
        resourceMetadataMappings: {
          "https://api.ceird.example/agent/mcp":
            "/.well-known/oauth-protected-resource/agent/mcp",
        },
      }
    );
  }, 10_000);

  it("lists Effect AI MCP tools after bearer verification", async () => {
    mcpHandlerMock.mockImplementation(
      (_verifyOptions, handler) => (request: Request) =>
        Promise.resolve(
          handler(request, {
            client_id: "mcp-client",
            ceird_org_id: "org_123",
            exp: Math.floor(Date.now() / 1000) + 300,
            scope: "ceird:read",
            sid: "session_abc",
            sub: "user_abc",
          })
        )
    );

    const authConfig = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const handler = makeMcpWebHandler({
      authConfig,
      runtimeLive: Layer.mergeAll(
        makeSuccessfulLabelListSqlLayer(),
        SiteLocationProvider.Development
      ),
    });

    const response = await handler(
      new Request("http://127.0.0.1:3000/mcp", {
        method: "POST",
        headers: makeAuthorizedMcpHeaders(await initializeMcpSession(handler)),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "tools/list",
        }),
      })
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      id: 1,
      jsonrpc: "2.0",
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            annotations: expect.objectContaining({
              destructiveHint: false,
              readOnlyHint: true,
            }),
            name: "ceird.labels.list",
          }),
        ]),
      },
    });
  }, 10_000);

  it("accepts Better Auth access-token JWTs that carry the OAuth client id in azp", async () => {
    mcpHandlerMock.mockImplementation(
      (_verifyOptions, handler) => (request: Request) =>
        Promise.resolve(
          handler(request, {
            azp: "mcp-client",
            ceird_org_id: "org_123",
            exp: Math.floor(Date.now() / 1000) + 300,
            scope: "ceird:read",
            sid: "session_abc",
            sub: "user_abc",
          })
        )
    );

    const authConfig = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const handler = makeMcpWebHandler({
      authConfig,
      runtimeLive: Layer.mergeAll(
        makeSuccessfulLabelListSqlLayer(),
        SiteLocationProvider.Development
      ),
    });

    const response = await handler(
      new Request("http://127.0.0.1:3000/mcp", {
        method: "POST",
        headers: makeAuthorizedMcpHeaders(await initializeMcpSession(handler)),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "tools/list",
        }),
      })
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      id: 1,
      jsonrpc: "2.0",
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "ceird.labels.list" }),
        ]),
      },
    });
  }, 10_000);

  it("rejects verified bearer tokens after the connected app grant is disconnected", async () => {
    mcpHandlerMock.mockImplementation(
      (_verifyOptions, handler) => (request: Request) =>
        Promise.resolve(
          handler(request, {
            client_id: "mcp-client",
            ceird_org_id: "org_123",
            exp: Math.floor(Date.now() / 1000) + 300,
            scope: "ceird:read",
            sid: "session_abc",
            sub: "user_abc",
          })
        )
    );

    const sql = vi.fn<
      (strings: TemplateStringsArray) => Effect.Effect<readonly unknown[]>
    >((strings) => {
      const statement = strings.join(" ");

      if (statement.includes("from oauth_consent")) {
        return Effect.succeed([]);
      }

      if (statement.includes("from session")) {
        return Effect.succeed([
          {
            activeOrganizationId: "org_123",
            expiresAt: new Date("2999-01-01T00:00:00.000Z"),
            userId: "user_abc",
          },
        ]);
      }

      if (statement.includes("from member")) {
        return Effect.succeed([{ role: "member" }]);
      }

      if (statement.includes("from labels")) {
        return Effect.succeed([
          {
            archived_at: null,
            created_at: new Date("2026-01-01T00:00:00.000Z"),
            id: "11111111-1111-4111-8111-111111111111",
            name: "Priority",
            normalized_name: "priority",
            organization_id: "org_123",
            updated_at: new Date("2026-01-01T00:00:00.000Z"),
          },
        ]);
      }

      return Effect.die(new Error(`Unexpected SQL in test mock: ${statement}`));
    });
    Object.assign(sql, {
      withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    });

    const authConfig = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const handler = makeMcpWebHandler({
      authConfig,
      runtimeLive: Layer.mergeAll(
        makeUnusedDomainDrizzleLayer(),
        Layer.succeed(
          SqlClient.SqlClient,
          sql as unknown as SqlClient.SqlClient
        ),
        makeNoConsentDomainDrizzleLayer(),
        SiteLocationProvider.Development
      ),
    });

    const response = await handler(
      new Request("http://127.0.0.1:3000/mcp", {
        method: "POST",
        headers: makeAuthorizedMcpHeaders(),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 0,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: {
              name: "ceird-domain-test",
              version: "0.0.0",
            },
          },
        }),
      })
    );

    expect(response?.status).toBe(401);
    expect(response?.headers.get("WWW-Authenticate")).toContain(
      'error="invalid_token"'
    );
    expect(sql).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining("from labels")])
    );
  }, 10_000);

  it("fails closed and logs when the connected-app consent check cannot read storage", async () => {
    const { logger, logs } = captureLogs();

    mcpHandlerMock.mockImplementation(
      (_verifyOptions, handler) => (request: Request) =>
        Promise.resolve(
          handler(request, {
            client_id: "mcp-client",
            ceird_org_id: "org_123",
            exp: Math.floor(Date.now() / 1000) + 300,
            scope: "ceird:read",
            sid: "session_abc",
            sub: "user_abc",
          })
        )
    );
    const sql = vi.fn<
      (strings: TemplateStringsArray) => Effect.Effect<readonly unknown[]>
    >((strings) => {
      const statement = strings.join(" ");

      if (statement.includes("from oauth_consent")) {
        return Effect.die(
          new Error(
            "database unavailable for rawtokenrawtokenrawtokenrawtoken1234"
          )
        );
      }

      return Effect.die(new Error(`Unexpected SQL in test mock: ${statement}`));
    });
    Object.assign(sql, {
      withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    });
    const authConfig = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const handler = makeMcpWebHandler({
      authConfig,
      baseLive: Layer.mergeAll(
        Logger.layer([logger]),
        Layer.succeed(References.MinimumLogLevel, "Trace")
      ),
      runtimeLive: Layer.mergeAll(
        makeUnusedDomainDrizzleLayer(),
        Layer.succeed(
          SqlClient.SqlClient,
          sql as unknown as SqlClient.SqlClient
        ),
        makeFailingConsentDomainDrizzleLayer(
          "database unavailable for rawtokenrawtokenrawtokenrawtoken1234"
        ),
        SiteLocationProvider.Development
      ),
    });

    const response = await handler(
      new Request("http://127.0.0.1:3000/mcp", {
        method: "POST",
        headers: makeAuthorizedMcpHeaders(),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 0,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: {
              name: "ceird-domain-test",
              version: "0.0.0",
            },
          },
        }),
      })
    );

    expect(response?.status).toBe(401);
    expect(response?.headers.get("WWW-Authenticate")).toContain(
      'error="invalid_token"'
    );
    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).toContain("MCP connected app consent check failed");
    expect(serializedLogs).toContain("storage_or_layer_failure");
    expect(serializedLogs).not.toContain(
      "rawtokenrawtokenrawtokenrawtoken1234"
    );
  }, 10_000);

  it("handles authorized no-argument MCP tool calls through the Effect AI router", async () => {
    mcpHandlerMock.mockImplementation(
      (_verifyOptions, handler) => (request: Request) =>
        Promise.resolve(
          handler(request, {
            client_id: "mcp-client",
            ceird_org_id: "org_123",
            exp: Math.floor(Date.now() / 1000) + 300,
            scope: "ceird:read",
            sid: "session_abc",
            sub: "user_abc",
          })
        )
    );

    const authConfig = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const handler = makeMcpWebHandler({
      authConfig,
      runtimeLive: Layer.mergeAll(
        makeSuccessfulLabelListSqlLayer(),
        SiteLocationProvider.Development
      ),
    });

    const response = await handler(
      new Request("http://127.0.0.1:3000/mcp", {
        method: "POST",
        headers: makeAuthorizedMcpHeaders(await initializeMcpSession(handler)),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "tools/call",
          params: {
            name: "ceird.labels.list",
          },
        }),
      })
    );

    expect(response?.status).toBe(200);
    const body = await response?.json();
    expect(body).toMatchObject({
      id: 1,
      jsonrpc: "2.0",
      result: {
        isError: false,
        structuredContent: {
          labels: [
            expect.objectContaining({
              id: "11111111-1111-4111-8111-111111111111",
              name: "Priority",
            }),
          ],
        },
      },
    });
  }, 10_000);

  it("keeps MCP session state when Worker request handlers share an authorized app cache", async () => {
    mcpHandlerMock.mockImplementation(
      (_verifyOptions, handler) => (request: Request) =>
        Promise.resolve(
          handler(request, {
            client_id: "mcp-client",
            ceird_org_id: "org_123",
            exp: Math.floor(Date.now() / 1000) + 300,
            scope: "ceird:read",
            sid: "session_abc",
            sub: "user_abc",
          })
        )
    );

    const authConfig = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const authorizedAppCache = makeMcpAuthorizedAppCache();
    const runtimeLive = Layer.mergeAll(
      makeSuccessfulLabelListSqlLayer(),
      SiteLocationProvider.Development
    );

    try {
      const initializeHandler = makeMcpWebHandler({
        authorizedAppCache,
        authConfig,
        runtimeLive,
      });
      const sessionId = await initializeMcpSession(initializeHandler);
      await initializeHandler.dispose();

      const toolHandler = makeMcpWebHandler({
        authorizedAppCache,
        authConfig,
        runtimeLive,
      });
      const response = await toolHandler(
        new Request("http://127.0.0.1:3000/mcp", {
          method: "POST",
          headers: makeAuthorizedMcpHeaders(sessionId),
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "1",
            method: "tools/list",
          }),
        })
      );

      expect(response?.status).toBe(200);
      await expect(response?.json()).resolves.toMatchObject({
        id: 1,
        jsonrpc: "2.0",
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({ name: "ceird.labels.list" }),
          ]),
        },
      });
    } finally {
      await disposeMcpAuthorizedAppCache(authorizedAppCache);
    }
  }, 10_000);

  it("does not retain request runtime layers in the authorized app cache", async () => {
    mcpHandlerMock.mockImplementation(
      (_verifyOptions, handler) => (request: Request) =>
        Promise.resolve(
          handler(request, {
            client_id: "mcp-client",
            ceird_org_id: "org_123",
            exp: Math.floor(Date.now() / 1000) + 300,
            scope: "ceird:read",
            sid: "session_abc",
            sub: "user_abc",
          })
        )
    );

    const authConfig = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const authorizedAppCache = makeMcpAuthorizedAppCache();
    const sql = vi.fn<
      (strings: TemplateStringsArray) => Effect.Effect<readonly unknown[]>
    >((strings) => {
      const statement = strings.join(" ");

      if (statement.includes("from oauth_consent")) {
        return Effect.succeed([{ scopes: ["ceird:read"] }]);
      }

      if (statement.includes("from session")) {
        return Effect.succeed([
          {
            activeOrganizationId: "org_123",
            expiresAt: new Date("2999-01-01T00:00:00.000Z"),
            userId: "user_abc",
          },
        ]);
      }

      if (statement.includes("from member")) {
        return Effect.succeed([{ role: "member" }]);
      }

      if (statement.includes("from labels")) {
        return Effect.succeed([
          {
            archived_at: null,
            created_at: new Date("2026-01-01T00:00:00.000Z"),
            id: "11111111-1111-4111-8111-111111111111",
            name: "Priority",
            normalized_name: "priority",
            organization_id: "org_123",
            updated_at: new Date("2026-01-01T00:00:00.000Z"),
          },
        ]);
      }

      return Effect.die(new Error(`Unexpected SQL in test mock: ${statement}`));
    });
    Object.assign(sql, {
      withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    });
    let acquiredSqlClients = 0;
    let releasedSqlClients = 0;
    const sqlLayer = Layer.effect(SqlClient.SqlClient)(
      Effect.acquireRelease(
        Effect.sync(() => {
          acquiredSqlClients += 1;
          return sql as unknown as SqlClient.SqlClient;
        }),
        () =>
          Effect.sync(() => {
            releasedSqlClients += 1;
          })
      )
    );
    const runtimeLive = Layer.mergeAll(
      makeUnusedDomainDrizzleLayer(),
      sqlLayer,
      makeSuccessfulDomainDrizzleLayer(),
      SiteLocationProvider.Development
    );

    try {
      const initializeHandler = makeMcpWebHandler({
        authorizedAppCache,
        authConfig,
        runtimeLive,
      });
      const sessionId = await initializeMcpSession(initializeHandler);
      await initializeHandler.dispose();

      expect(acquiredSqlClients).toBe(1);
      expect(releasedSqlClients).toBe(1);

      const toolHandler = makeMcpWebHandler({
        authorizedAppCache,
        authConfig,
        runtimeLive,
      });
      const response = await toolHandler(
        new Request("http://127.0.0.1:3000/mcp", {
          method: "POST",
          headers: makeAuthorizedMcpHeaders(sessionId),
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "1",
            method: "tools/call",
            params: {
              name: "ceird.labels.list",
            },
          }),
        })
      );

      expect(response?.status).toBe(200);
      await expect(response?.json()).resolves.toMatchObject({
        id: 1,
        jsonrpc: "2.0",
        result: {
          isError: false,
        },
      });
      expect(acquiredSqlClients).toBe(3);
      expect(releasedSqlClients).toBe(3);
    } finally {
      await disposeMcpAuthorizedAppCache(authorizedAppCache);
    }
  }, 10_000);

  it("returns an MCP tool error before domain execution when scope is insufficient", async () => {
    mcpHandlerMock.mockImplementation(
      (_verifyOptions, handler) => (request: Request) =>
        Promise.resolve(
          handler(request, {
            client_id: "mcp-client",
            ceird_org_id: "org_123",
            exp: Math.floor(Date.now() / 1000) + 300,
            scope: "ceird:read",
            sid: "session_abc",
            sub: "user_abc",
          })
        )
    );

    const sql = vi.fn<
      (strings: TemplateStringsArray) => Effect.Effect<readonly unknown[]>
    >((strings) => {
      const statement = strings.join(" ");

      if (statement.includes("from oauth_consent")) {
        return Effect.succeed([{ scopes: ["ceird:read"] }]);
      }

      return Effect.die(
        new Error("Domain SQL should not run for forbidden tools")
      );
    });
    Object.assign(sql, {
      withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    });

    const authConfig = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const handler = makeMcpWebHandler({
      authConfig,
      runtimeLive: Layer.mergeAll(
        makeUnusedDomainDrizzleLayer(),
        Layer.succeed(
          SqlClient.SqlClient,
          sql as unknown as SqlClient.SqlClient
        ),
        makeSuccessfulDomainDrizzleLayer(),
        SiteLocationProvider.Development
      ),
    });

    const response = await handler(
      new Request("http://127.0.0.1:3000/mcp", {
        method: "POST",
        headers: makeAuthorizedMcpHeaders(await initializeMcpSession(handler)),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "tools/call",
          params: {
            arguments: {},
            name: "ceird.jobs.activity.list",
          },
        }),
      })
    );

    expect(response?.status).toBe(200);
    expect(sql).not.toHaveBeenCalled();
    await expect(response?.json()).resolves.toMatchObject({
      id: 1,
      jsonrpc: "2.0",
      result: {
        content: [
          expect.objectContaining({
            text: expect.stringContaining(
              "Forbidden: missing ceird:admin scope"
            ),
          }),
        ],
        isError: true,
      },
    });
  }, 10_000);

  it("rejects verified bearer tokens that do not carry a Better Auth session", async () => {
    mcpHandlerMock.mockImplementation(
      (_verifyOptions, handler) => (request: Request) =>
        Promise.resolve(
          handler(request, {
            client_id: "mcp-client",
            ceird_org_id: "org_123",
            exp: Math.floor(Date.now() / 1000) + 300,
            scope: "ceird:read",
            sub: "user_abc",
          })
        )
    );

    const authConfig = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const handler = makeMcpWebHandler({ authConfig });

    const response = await handler(
      new Request("http://127.0.0.1:3000/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer token_123",
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "tools/list",
        }),
      })
    );

    expect(response?.status).toBe(401);
    expect(response?.headers.get("WWW-Authenticate")).toContain(
      'error="invalid_token"'
    );
  }, 10_000);

  it("rejects verified bearer tokens that do not carry an OAuth client id", async () => {
    mcpHandlerMock.mockImplementation(
      (_verifyOptions, handler) => (request: Request) =>
        Promise.resolve(
          handler(request, {
            ceird_org_id: "org_123",
            exp: Math.floor(Date.now() / 1000) + 300,
            scope: "ceird:read",
            sid: "session_abc",
            sub: "user_abc",
          })
        )
    );

    const authConfig = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const handler = makeMcpWebHandler({ authConfig });

    const response = await handler(
      new Request("http://127.0.0.1:3000/mcp", {
        method: "POST",
        headers: makeAuthorizedMcpHeaders(),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "tools/list",
        }),
      })
    );

    expect(response?.status).toBe(401);
    expect(response?.headers.get("WWW-Authenticate")).toContain(
      'error="invalid_token"'
    );
  }, 10_000);

  it("loads authorized app cache options from Effect config", async () => {
    const configProvider = configProviderFromMap(
      new Map([
        ["MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES", "32"],
        ["MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS", "45"],
      ])
    );

    await expect(
      Effect.runPromise(
        loadMcpAuthorizedAppCacheOptions.pipe(
          withConfigProvider(configProvider)
        )
      )
    ).resolves.toStrictEqual({
      maxEntries: 32,
      ttlMs: 45_000,
    });
  });

  it("rejects non-positive authorized app cache config", async () => {
    const configProvider = configProviderFromMap(
      new Map([["MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES", "0"]])
    );

    const result = await Effect.runPromise(
      loadMcpAuthorizedAppCacheOptions.pipe(
        withConfigProvider(configProvider),
        effectEither
      )
    );

    expect(result._tag).toBe("Left");
    expect(
      String(result._tag === "Left" ? result.left : result.right)
    ).toContain(
      "MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES must be a positive integer"
    );
  });

  it("rejects non-positive authorized app cache TTL config", async () => {
    const configProvider = configProviderFromMap(
      new Map([["MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS", "0"]])
    );

    const result = await Effect.runPromise(
      loadMcpAuthorizedAppCacheOptions.pipe(
        withConfigProvider(configProvider),
        effectEither
      )
    );

    expect(result._tag).toBe("Left");
    expect(
      String(result._tag === "Left" ? result.left : result.right)
    ).toContain(
      "MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS must be a positive integer"
    );
  });

  it("does not share initialized MCP sessions across OAuth client ids", async () => {
    mcpHandlerMock.mockImplementation(
      (_verifyOptions, handler) => (request: Request) =>
        Promise.resolve(
          handler(request, {
            client_id: request.headers.get("x-test-client-id") ?? "mcp-client",
            ceird_org_id: "org_123",
            exp: Math.floor(Date.now() / 1000) + 300,
            scope: "ceird:read",
            sid: "session_abc",
            sub: "user_abc",
          })
        )
    );

    const authConfig = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const authorizedAppCache = makeMcpAuthorizedAppCache();
    const runtimeLive = Layer.mergeAll(
      makeSuccessfulLabelListSqlLayer(),
      SiteLocationProvider.Development
    );

    try {
      const handler = makeMcpWebHandler({
        authorizedAppCache,
        authConfig,
        runtimeLive,
      });
      const sessionId = await initializeMcpSession(handler, "client-a");
      const response = await handler(
        new Request("http://127.0.0.1:3000/mcp", {
          method: "POST",
          headers: makeAuthorizedMcpHeaders(sessionId, "client-b"),
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "1",
            method: "tools/list",
          }),
        })
      );

      expect(response?.status).not.toBe(200);
    } finally {
      await disposeMcpAuthorizedAppCache(authorizedAppCache);
    }
  }, 10_000);
});

async function initializeMcpSession(
  handler: McpWebHandler,
  clientId?: string | undefined
) {
  const response = await handler(
    new Request("http://127.0.0.1:3000/mcp", {
      method: "POST",
      headers: makeAuthorizedMcpHeaders(undefined, clientId),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: {
            name: "ceird-domain-test",
            version: "0.0.0",
          },
        },
      }),
    })
  );

  expect(response?.status).toBe(200);
  const sessionId = response?.headers.get("mcp-session-id");
  expect(sessionId).toStrictEqual(expect.any(String));

  return sessionId as string;
}

function makeAuthorizedMcpHeaders(
  sessionId?: string | undefined,
  clientId?: string | undefined
) {
  return {
    authorization: "Bearer token_123",
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    ...(clientId === undefined ? {} : { "x-test-client-id": clientId }),
    ...(sessionId === undefined ? {} : { "mcp-session-id": sessionId }),
  };
}

function makeSuccessfulLabelListSqlLayer() {
  const sql = vi.fn<
    (strings: TemplateStringsArray) => Effect.Effect<readonly unknown[]>
  >((strings) => {
    const statement = strings.join(" ");

    if (statement.includes("from oauth_consent")) {
      return Effect.succeed([{ scopes: ["ceird:read"] }]);
    }

    return Effect.die(new Error(`Unexpected SQL in test mock: ${statement}`));
  });

  Object.assign(sql, {
    withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  });

  return Layer.mergeAll(
    Layer.succeed(SqlClient.SqlClient, sql as unknown as SqlClient.SqlClient),
    makeSuccessfulDomainDrizzleLayer()
  );
}

function makeUnusedDomainDrizzleLayer() {
  return Layer.succeed(
    DomainDrizzle,
    DomainDrizzle.of({
      db: new Proxy(
        {},
        {
          get: (_target, property) => {
            throw new Error(
              `DomainDrizzle.${String(property)} should not be called in MCP HTTP tests`
            );
          },
        }
      ) as never,
    })
  );
}

function makeSuccessfulDomainDrizzleLayer() {
  const db = {
    select: (selection: Record<string, unknown>) => ({
      from: () => ({
        where: () => ({
          limit: () => Effect.succeed(makeDrizzleRows(selection)),
          orderBy: () => Effect.succeed(makeDrizzleRows(selection)),
        }),
        orderBy: () => Effect.succeed(makeDrizzleRows(selection)),
      }),
    }),
  };

  return Layer.succeed(
    DomainDrizzle,
    DomainDrizzle.of({ db } as unknown as Context.Service.Shape<
      typeof DomainDrizzle
    >)
  );
}

function makeFailingConsentDomainDrizzleLayer(message: string) {
  const db = {
    select: (selection: Record<string, unknown>) => ({
      from: () => ({
        where: () => ({
          limit: () =>
            "scopes" in selection
              ? Effect.die(new Error(message))
              : Effect.succeed(makeDrizzleRows(selection)),
          orderBy: () => Effect.succeed(makeDrizzleRows(selection)),
        }),
        orderBy: () => Effect.succeed(makeDrizzleRows(selection)),
      }),
    }),
  };

  return Layer.succeed(
    DomainDrizzle,
    DomainDrizzle.of({ db } as unknown as Context.Service.Shape<
      typeof DomainDrizzle
    >)
  );
}

function makeNoConsentDomainDrizzleLayer() {
  const db = {
    select: (selection: Record<string, unknown>) => ({
      from: () => ({
        where: () => ({
          limit: () =>
            "scopes" in selection
              ? Effect.succeed([])
              : Effect.succeed(makeDrizzleRows(selection)),
          orderBy: () => Effect.succeed(makeDrizzleRows(selection)),
        }),
        orderBy: () => Effect.succeed(makeDrizzleRows(selection)),
      }),
    }),
  };

  return Layer.succeed(
    DomainDrizzle,
    DomainDrizzle.of({ db } as unknown as Context.Service.Shape<
      typeof DomainDrizzle
    >)
  );
}

function makeDrizzleRows(selection: Record<string, unknown>) {
  if ("scopes" in selection) {
    return [{ scopes: ["ceird:read"] }];
  }

  if ("activeOrganizationId" in selection) {
    return [
      {
        activeOrganizationId: "org_123",
        expiresAt: new Date("2999-01-01T00:00:00.000Z"),
        userId: "user_abc",
      },
    ];
  }

  if ("role" in selection) {
    return [{ role: "member" }];
  }

  if ("archivedAt" in selection) {
    return [
      {
        archivedAt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        id: "11111111-1111-4111-8111-111111111111",
        name: "Priority",
        normalizedName: "priority",
        organizationId: "org_123",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ];
  }

  return [];
}

function captureLogs() {
  const logs: unknown[] = [];
  const logger = Logger.make((input) => {
    logs.push({
      annotations: input.fiber.getRef(References.CurrentLogAnnotations),
      level: input.logLevel.toUpperCase(),
      message: input.message,
    });
  });

  return { logger, logs };
}
