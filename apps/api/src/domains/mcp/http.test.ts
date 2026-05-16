import { beforeEach, expect, vi } from "vitest";

const { mcpHandlerMock } = vi.hoisted(() => ({
  mcpHandlerMock: vi.fn(),
}));

vi.mock("@better-auth/oauth-provider", () => ({
  mcpHandler: mcpHandlerMock,
}));

import { makeAuthenticationConfig } from "../identity/authentication/config.js";
import { makeMcpWebHandler } from "./http.js";

describe("mcp http handler", () => {
  beforeEach(() => {
    mcpHandlerMock.mockReset();
    mcpHandlerMock.mockImplementation(
      () => async () => new Response(null, { status: 204 })
    );
  });

  it("serves protected resource metadata at both well-known paths", async () => {
    const authConfig = makeAuthenticationConfig({
      appOrigin: "https://app.ceird.example",
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });
    const handler = makeMcpWebHandler({ authConfig });

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
    const handler = makeMcpWebHandler({ authConfig });

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

    expect(mcpHandlerMock).toHaveBeenCalledTimes(1);
    expect(mcpHandlerMock).toHaveBeenCalledWith(
      {
        verifyOptions: {
          audience: "https://api.ceird.example/agent/mcp",
          issuer: "https://auth.ceird.example/api/auth",
        },
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

  it("handles authorized MCP requests through transport using jwt auth info", async () => {
    mcpHandlerMock.mockImplementation(
      (
        _verifyOptions: unknown,
        handler: (
          request: Request,
          jwt: Record<string, unknown>
        ) => Promise<Response>
      ) =>
        async (request: Request) =>
          handler(request, {
            client_id: "mcp-client",
            exp: Math.floor(Date.now() / 1000) + 300,
            scope: "ceird:read",
            sid: "session_abc",
            sub: "user_abc",
          })
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
          method: "tools/call",
          params: {
            name: "ceird.labels.list",
            arguments: {},
          },
        }),
      })
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      id: "1",
      jsonrpc: "2.0",
      result: {
        isError: true,
      },
    });
  }, 10_000);
});
