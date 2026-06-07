import { describe, expect, it } from "@effect/vitest";

import type { DomainWorkerEnv } from "./env.js";
import { domainWorkerEnvConfigMap } from "./env.js";

function makeWorkerEnv(): DomainWorkerEnv {
  return {
    AUTH_APP_ORIGIN: "https://app.example.com",
    AUTH_EMAIL: {
      send: () => Promise.resolve({ messageId: "email_123" }),
    },
    AUTH_EMAIL_FROM: "auth@example.com",
    AUTH_EMAIL_FROM_NAME: "Ceird",
    AUTH_EMAIL_QUEUE: {
      send: () => Promise.resolve(),
    } as unknown as Queue<unknown>,
    AGENT_INTERNAL_SECRET: "agent-secret",
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
    const config = domainWorkerEnvConfigMap({
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
    const config = domainWorkerEnvConfigMap(makeWorkerEnv());

    expect(config.get("GOOGLE_MAPS_API_KEY")).toBe("google-key");
  });

  it("propagates explicit local Alchemy runtime settings", () => {
    const config = domainWorkerEnvConfigMap({
      ...makeWorkerEnv(),
      CEIRD_LOCAL_DEV: "true",
      DATABASE: undefined,
      DATABASE_URL: "postgresql://ceird:secret@example.neon.tech/ceird",
    });

    expect(config.get("CEIRD_LOCAL_DEV")).toBe("true");
    expect(config.get("DATABASE_URL")).toBe(
      "postgresql://ceird:secret@example.neon.tech/ceird"
    );
  });

  it("propagates the auth rate limit override when Alchemy provides one", () => {
    const config = domainWorkerEnvConfigMap({
      ...makeWorkerEnv(),
      AUTH_RATE_LIMIT_ENABLED: "false",
    });

    expect(config.get("AUTH_RATE_LIMIT_ENABLED")).toBe("false");
  });

  it("propagates the password compromise check override when Alchemy provides one", () => {
    const config = domainWorkerEnvConfigMap({
      ...makeWorkerEnv(),
      AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED: "false",
      AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE:
        "http://127.0.0.1:8790/range",
    });

    expect(config.get("AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED")).toBe("false");
    expect(
      config.get("AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE")
    ).toBe("http://127.0.0.1:8790/range");
  });

  it("propagates optional Turnstile captcha settings", () => {
    const config = domainWorkerEnvConfigMap({
      ...makeWorkerEnv(),
      AUTH_CAPTCHA_ENABLED: "true",
      AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE: "http://127.0.0.1:8787/siteverify",
      AUTH_CAPTCHA_TURNSTILE_SECRET_KEY: "turnstile-secret-key",
    });

    expect(config.get("AUTH_CAPTCHA_ENABLED")).toBe("true");
    expect(config.get("AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE")).toBe(
      "http://127.0.0.1:8787/siteverify"
    );
    expect(config.get("AUTH_CAPTCHA_TURNSTILE_SECRET_KEY")).toBe(
      "turnstile-secret-key"
    );
  });

  it("propagates optional Better Auth rotation secrets", () => {
    const config = domainWorkerEnvConfigMap({
      ...makeWorkerEnv(),
      BETTER_AUTH_SECRETS:
        "2:current-secret-value-0123456789abcdef,1:previous-secret-value-0123456789abcdef",
    });

    expect(config.get("BETTER_AUTH_SECRETS")).toBe(
      "2:current-secret-value-0123456789abcdef,1:previous-secret-value-0123456789abcdef"
    );
  });

  it("propagates optional OAuth MCP URL overrides", () => {
    const config = domainWorkerEnvConfigMap({
      ...makeWorkerEnv(),
      MCP_RESOURCE_URL: "https://mcp.example.com/mcp",
      OAUTH_ISSUER_URL: "https://auth.example.com/api/auth",
    });

    expect(config.get("MCP_RESOURCE_URL")).toBe("https://mcp.example.com/mcp");
    expect(config.get("OAUTH_ISSUER_URL")).toBe(
      "https://auth.example.com/api/auth"
    );
  });

  it("propagates optional MCP authorized app cache overrides", () => {
    const config = domainWorkerEnvConfigMap({
      ...makeWorkerEnv(),
      MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES: "32",
      MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS: "45",
    });

    expect(config.get("MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES")).toBe("32");
    expect(config.get("MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS")).toBe("45");
  });

  it("propagates the Agent action-run stale window", () => {
    const config = domainWorkerEnvConfigMap({
      ...makeWorkerEnv(),
      AGENT_ACTION_RUN_STALE_AFTER_SECONDS: "120",
    });

    expect(config.get("AGENT_ACTION_RUN_STALE_AFTER_SECONDS")).toBe("120");
  });
});
