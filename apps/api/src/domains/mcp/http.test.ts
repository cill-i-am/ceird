import type { mcpHandler as betterAuthMcpHandler } from "@better-auth/oauth-provider";
import { SqlClient } from "@effect/sql";
import { Effect, Layer } from "effect";
import { beforeEach, expect, vi } from "vitest";

import { makeAuthenticationConfig } from "../identity/authentication/config.js";
import { SiteGeocoder } from "../sites/geocoder.js";
import { makeMcpWebHandler } from "./http.js";

type BetterAuthMcpHandler = typeof betterAuthMcpHandler;

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
        SiteGeocoder.Development
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
        SiteGeocoder.Development
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
        SiteGeocoder.Development
      ),
    });

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

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject([
      {
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
      },
    ]);
  }, 10_000);

  it("handles authorized no-argument MCP tool calls through the Effect AI router", async () => {
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
    const handler = makeMcpWebHandler({
      authConfig,
      runtimeLive: Layer.mergeAll(
        makeSuccessfulLabelListSqlLayer(),
        SiteGeocoder.Development
      ),
    });

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
          method: "tools/call",
          params: {
            name: "ceird.labels.list",
          },
        }),
      })
    );

    expect(response?.status).toBe(200);
    const body = await response?.json();
    expect(body).toMatchObject([
      {
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
      },
    ]);
  }, 10_000);

  it("returns an MCP tool error before domain execution when scope is insufficient", async () => {
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

    const sql = vi.fn<
      (strings: TemplateStringsArray) => Effect.Effect<readonly unknown[]>
    >(() =>
      Effect.die(new Error("Domain SQL should not run for forbidden tools"))
    );
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
        Layer.succeed(
          SqlClient.SqlClient,
          sql as unknown as SqlClient.SqlClient
        ),
        SiteGeocoder.Development
      ),
    });

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
          method: "tools/call",
          params: {
            arguments: {},
            name: "ceird.rate_cards.list",
          },
        }),
      })
    );

    expect(response?.status).toBe(200);
    expect(sql).not.toHaveBeenCalled();
    await expect(response?.json()).resolves.toMatchObject([
      {
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
          structuredContent: {
            code: "FORBIDDEN",
            message: "Forbidden: missing ceird:admin scope",
          },
        },
      },
    ]);
  }, 10_000);

  it("rejects verified bearer tokens that do not carry a Better Auth session", async () => {
    mcpHandlerMock.mockImplementation(
      (_verifyOptions, handler) => (request: Request) =>
        Promise.resolve(
          handler(request, {
            client_id: "mcp-client",
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
});

function makeSuccessfulLabelListSqlLayer() {
  const sql = vi.fn<
    (strings: TemplateStringsArray) => Effect.Effect<readonly unknown[]>
  >((strings) => {
    const statement = strings.join(" ");

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

  return Layer.succeed(
    SqlClient.SqlClient,
    sql as unknown as SqlClient.SqlClient
  );
}
