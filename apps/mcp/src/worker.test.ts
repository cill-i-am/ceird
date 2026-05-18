import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type { McpWorkerEnv } from "./platform/cloudflare/env.js";
import { mcpWorkerEnvConfigMap } from "./platform/cloudflare/env.js";
import { handleMcpWorkerFetch } from "./platform/cloudflare/runtime.js";
import worker from "./worker.js";

describe("mcp worker env", () => {
  it("maps OAuth, MCP, Google Maps, and Alchemy metadata into Effect config", () => {
    const config = mcpWorkerEnvConfigMap(makeEnv());

    expect(config.get("ALCHEMY_STACK_NAME")).toBe("ceird");
    expect(config.get("ALCHEMY_STAGE")).toBe("test");
    expect(config.get("BETTER_AUTH_BASE_URL")).toBe(
      "https://api.example.com/api/auth"
    );
    expect(config.get("GOOGLE_MAPS_API_KEY")).toBe("google_maps_key");
    expect(config.get("MCP_RESOURCE_URL")).toBe("https://mcp.example.com/mcp");
    expect(config.get("NODE_ENV")).toBe("production");
    expect(config.get("OAUTH_ISSUER_URL")).toBe(
      "https://api.example.com/api/auth"
    );
  });
});

describe("mcp worker fetch", () => {
  it("serves protected resource metadata", async () => {
    const response = await runFetch(
      new Request(
        "https://mcp.example.com/.well-known/oauth-protected-resource"
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resource: "https://mcp.example.com/mcp",
      authorization_servers: ["https://api.example.com/api/auth"],
      bearer_methods_supported: ["header"],
    });
  });

  it("returns 404 for unknown paths", async () => {
    const response = await runFetch(
      new Request("https://mcp.example.com/jobs")
    );

    expect(response.status).toBe(404);
  });

  it("returns a resource metadata hint when bearer auth is missing", async () => {
    const response = await worker.fetch(
      new Request("https://mcp.example.com/mcp", { method: "POST" }),
      makeEnv()
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain(
      'resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"'
    );
  });
});

function runFetch(request: Request) {
  return Effect.runPromise(handleMcpWorkerFetch(request, makeEnv()));
}

function makeEnv(): McpWorkerEnv {
  return {
    ALCHEMY_STACK_NAME: "ceird",
    ALCHEMY_STAGE: "test",
    BETTER_AUTH_BASE_URL: "https://api.example.com/api/auth",
    DATABASE: {
      connectionString: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    } as McpWorkerEnv["DATABASE"],
    GOOGLE_MAPS_API_KEY: "google_maps_key",
    MCP_RESOURCE_URL: "https://mcp.example.com/mcp",
    NODE_ENV: "production",
    OAUTH_ISSUER_URL: "https://api.example.com/api/auth",
  };
}
