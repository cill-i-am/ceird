import { describe, expect, it } from "@effect/vitest";

import type { ApiWorkerEnv } from "./env.js";
import { apiWorkerEnvConfigMap } from "./env.js";

function makeWorkerEnv(): ApiWorkerEnv {
  return {
    AUTH_APP_ORIGIN: "https://app.example.com",
    AUTH_EMAIL: {
      send: () => Promise.resolve({ messageId: "email_123" }),
    },
    AUTH_EMAIL_FROM: "auth@example.com",
    AUTH_EMAIL_FROM_NAME: "Ceird",
    AUTH_RATE_LIMIT_ENABLED: "false",
    AUTH_EMAIL_QUEUE: {
      send: () => Promise.resolve(),
    } as unknown as Queue<unknown>,
    BETTER_AUTH_BASE_URL: "https://api.example.com/api/auth",
    BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    DATABASE: {
      connectionString: "postgresql://postgres:postgres@localhost:5432/app",
    } as Hyperdrive,
    GOOGLE_MAPS_API_KEY: "google-key",
    NODE_ENV: "test",
  };
}

describe("Cloudflare Worker environment config", () => {
  it("exposes the Alchemy runtime stage to Effect config", () => {
    const config = apiWorkerEnvConfigMap({
      ...makeWorkerEnv(),
      ALCHEMY_STACK_NAME: "ceird",
      ALCHEMY_STAGE: "codex-alchemy-v2-native-migration",
    });

    expect(config.get("ALCHEMY_STACK_NAME")).toBe("ceird");
    expect(config.get("ALCHEMY_STAGE")).toBe(
      "codex-alchemy-v2-native-migration"
    );
  });

  it("exposes the Google Maps API key to Effect config", () => {
    const config = apiWorkerEnvConfigMap(makeWorkerEnv());

    expect(config.get("GOOGLE_MAPS_API_KEY")).toBe("google-key");
  });

  it("exposes the auth rate-limit flag to Effect config", () => {
    const config = apiWorkerEnvConfigMap(makeWorkerEnv());

    expect(config.get("AUTH_RATE_LIMIT_ENABLED")).toBe("false");
  });

  it("propagates optional OAuth MCP URL overrides", () => {
    const config = apiWorkerEnvConfigMap({
      ...makeWorkerEnv(),
      MCP_RESOURCE_URL: "https://mcp.example.com/mcp",
      OAUTH_ISSUER_URL: "https://auth.example.com/api/auth",
    });

    expect(config.get("MCP_RESOURCE_URL")).toBe("https://mcp.example.com/mcp");
    expect(config.get("OAUTH_ISSUER_URL")).toBe(
      "https://auth.example.com/api/auth"
    );
  });
});
