import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";

import { configWithoutCloudflareBootstrapSecrets } from "./stages.contract.ts";
import {
  loadInfraStageConfig,
  makeAlchemyStageIdentity,
  resourceName,
  stageResourceName,
} from "./stages.ts";

describe("Alchemy stage identity", () => {
  it("treats main as the production stage", () => {
    const identity = makeAlchemyStageIdentity({
      appName: "ceird",
      stage: "main",
    });

    expect(identity).toStrictEqual({
      appName: "ceird",
      isProduction: true,
      isPullRequestPreview: false,
      neonBranchName: "main",
      stage: "main",
      stageSlug: "main",
    });
    expect(stageResourceName(identity, "api")).toBe("ceird-main-api");
  });

  it("normalizes branch-shaped stages for Cloudflare and Neon names", () => {
    const identity = makeAlchemyStageIdentity({
      appName: "ceird",
      stage: "codex/Alchemy V2 Native Migration!",
    });

    expect(identity).toMatchObject({
      isProduction: false,
      isPullRequestPreview: false,
      neonBranchName: "codex-alchemy-v2-native-migration",
      stage: "codex/Alchemy V2 Native Migration!",
      stageSlug: "codex-alchemy-v2-native-migration",
    });
    expect(stageResourceName(identity, "auth_email")).toBe(
      "ceird-codex-alchemy-v2-native-migration-auth-email"
    );
  });

  it("adds a deterministic hash when truncating long stage names", () => {
    const first = makeAlchemyStageIdentity({
      appName: "ceird",
      stage: "feature/this-stage-name-is-way-too-long-for-provider-names",
    });
    const second = makeAlchemyStageIdentity({
      appName: "ceird",
      stage: "feature/this-stage-name-is-way-too-long-for-provider-names",
    });

    expect(first.stageSlug.length).toBeLessThanOrEqual(40);
    expect(first.stageSlug).toMatch(
      /^feature-this-stage-name-is-way-[a-f0-9]{8}$/
    );
    expect(second.stageSlug).toBe(first.stageSlug);
  });

  it("keeps the resourceName helper on the normalized stage path", () => {
    expect(
      resourceName(
        {
          ...configWithoutCloudflareBootstrapSecrets,
          stage: "preview",
        },
        "api"
      )
    ).toBe("ceird-preview-api");
  });

  it("uses main as the default infrastructure fixture stage", () => {
    expect(configWithoutCloudflareBootstrapSecrets.stage).toBe("main");
    expect(resourceName(configWithoutCloudflareBootstrapSecrets, "api")).toBe(
      "ceird-main-api"
    );
  });

  it("loads config for an explicit Alchemy stage without CEIRD_INFRA_STAGE", () => {
    const config = Effect.runSync(
      loadInfraStageConfig("dev_cillian").pipe(
        Effect.provide(ConfigProvider.layer(makeConfigProvider()))
      )
    );

    expect(config.stage).toBe("dev_cillian");
    expect(config.appHostname).toBe("app.dev-cillian.example.com");
    expect(config.apiHostname).toBe("api.dev-cillian.example.com");
    expect(config.authRateLimitEnabled).toBeTruthy();
    expect(config.agentActionRunStaleAfterSeconds).toBe(900);
    expect(config.mcpHostname).toBe("mcp.dev-cillian.example.com");
    expect(config.hyperdriveName).toBe("ceird-dev-cillian-postgres");
    expect(config.mcpAuthorizedAppCacheMaxEntries).toBeUndefined();
    expect(config.mcpAuthorizedAppCacheTtlSeconds).toBeUndefined();
    expect(config.neonDatabaseName).toBe("ceird");
    expect(config.neonDefaultBranchName).toBe("base");
    expect(config.neonHistoryRetentionSeconds).toBe(21_600);
    expect(config.neonParentBranchProtected).toBeFalsy();
    expect(config.neonParentBranchName).toBe("main");
    expect(config.neonParentStage).toBe("main");
    expect(config.neonPgVersion).toBe(17);
    expect(config.neonRegion).toBe("aws-eu-west-2");
    expect(resourceName(config, "api")).toBe("ceird-dev-cillian-api");
  });

  it("defaults the Ceird zone and stage-scoped app/API hostnames for local Alchemy runs", () => {
    const config = Effect.runSync(
      loadInfraStageConfig("codex-alchemy-v2-native-migration").pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                AUTH_EMAIL_FROM: "no-reply@example.com",
                GOOGLE_MAPS_API_KEY: "google-key",
              },
            })
          )
        )
      )
    );

    expect(config.zoneName).toBe("ceird.app");
    expect(config.appHostname).toBe(
      "app.codex-alchemy-v2-native-migration.ceird.app"
    );
    expect(config.apiHostname).toBe(
      "api.codex-alchemy-v2-native-migration.ceird.app"
    );
    expect(config.agentHostname).toBe(
      "agent.codex-alchemy-v2-native-migration.ceird.app"
    );
    expect(config.mcpHostname).toBe(
      "mcp.codex-alchemy-v2-native-migration.ceird.app"
    );
  });

  it("defaults the parent stage to stage-scoped app/API hostnames", () => {
    const config = Effect.runSync(
      loadInfraStageConfig("main").pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                AUTH_EMAIL_FROM: "no-reply@example.com",
                GOOGLE_MAPS_API_KEY: "google-key",
              },
            })
          )
        )
      )
    );

    expect(config.zoneName).toBe("ceird.app");
    expect(config.appHostname).toBe("app.main.ceird.app");
    expect(config.apiHostname).toBe("api.main.ceird.app");
    expect(config.agentHostname).toBe("agent.main.ceird.app");
    expect(config.mcpHostname).toBe("mcp.main.ceird.app");
    expect(config.hyperdriveName).toBe("ceird-production-postgres");
    expect(config.neonHistoryRetentionSeconds).toBe(21_600);
    expect(config.neonParentBranchProtected).toBeFalsy();
  });

  it("uses production tenant hosts only when main is on the canonical app host", () => {
    const config = Effect.runSync(
      loadInfraStageConfig("main").pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                AUTH_EMAIL_FROM: "no-reply@example.com",
                CEIRD_APP_HOSTNAME: "app.ceird.app",
                CEIRD_API_HOSTNAME: "api.ceird.app",
                CEIRD_AGENT_HOSTNAME: "agent.ceird.app",
                CEIRD_MCP_HOSTNAME: "mcp.ceird.app",
                CEIRD_ZONE_NAME: "ceird.app",
                GOOGLE_MAPS_API_KEY: "google-key",
              },
            })
          )
        )
      )
    );

    expect(config.tenantHostMode).toBe("production");
    expect(config.tenantBaseDomain).toBe("ceird.app");
    expect(config.tenantStageAlias).toBeUndefined();
    expect(config.tenantRoutePattern).toBe("*.ceird.app/*");
    expect(config.tenantTrustedOriginPattern).toBe("https://*.ceird.app");
    expect(config.authCookiePrefix).toBe("ceird-main");
    expect(config.authCookieDomain).toBe("ceird.app");
  });

  it("keeps partial canonical production host overrides in staged tenant mode", () => {
    const config = Effect.runSync(
      loadInfraStageConfig("main").pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                AUTH_EMAIL_FROM: "no-reply@example.com",
                CEIRD_APP_HOSTNAME: "app.ceird.app",
                CEIRD_ZONE_NAME: "ceird.app",
                GOOGLE_MAPS_API_KEY: "google-key",
              },
            })
          )
        )
      )
    );

    expect(config.apiHostname).toBe("api.main.ceird.app");
    expect(config.agentHostname).toBe("agent.main.ceird.app");
    expect(config.mcpHostname).toBe("mcp.main.ceird.app");
    expect(config.tenantHostMode).toBe("stage");
    expect(config.tenantRoutePattern).toBe("*--main.ceird.app/*");
    expect(config.tenantTrustedOriginPattern).toBe("https://*--main.ceird.app");
    expect(config.authCookieDomain).toBe("ceird.app");
  });

  it("keeps local main-stage defaults in staged tenant mode", () => {
    const config = Effect.runSync(
      loadInfraStageConfig("main").pipe(
        Effect.provide(ConfigProvider.layer(makeConfigProvider()))
      )
    );

    expect(config.appHostname).toBe("app.main.example.com");
    expect(config.tenantHostMode).toBe("stage");
    expect(config.tenantStageAlias).toBe("main");
    expect(config.tenantRoutePattern).toBe("*--main.example.com/*");
    expect(config.tenantTrustedOriginPattern).toBe(
      "https://*--main.example.com"
    );
    expect(config.authCookieDomain).toBe("example.com");
  });

  it("derives tenant host aliases for staging stages", () => {
    const config = Effect.runSync(
      loadInfraStageConfig("staging").pipe(
        Effect.provide(ConfigProvider.layer(makeConfigProvider()))
      )
    );

    expect(config.tenantHostMode).toBe("stage");
    expect(config.tenantStageAlias).toBe("staging");
    expect(config.tenantRoutePattern).toBe("*--staging.example.com/*");
    expect(config.tenantTrustedOriginPattern).toBe(
      "https://*--staging.example.com"
    );
  });

  it("derives tenant host aliases for PR previews", () => {
    const config = Effect.runSync(
      loadInfraStageConfig("pr-123").pipe(
        Effect.provide(ConfigProvider.layer(makeConfigProvider()))
      )
    );

    expect(config.tenantHostMode).toBe("stage");
    expect(config.tenantStageAlias).toBe("pr-123");
    expect(config.tenantRoutePattern).toBe("*--pr-123.example.com/*");
    expect(config.authCookiePrefix).toBe("ceird-pr-123");
    expect(config.authCookieDomain).toBe("example.com");
  });

  it("uses a short deterministic tenant alias for long branch stages", () => {
    const config = Effect.runSync(
      loadInfraStageConfig(
        "feature/this-stage-name-is-way-too-long-for-tenant-hosts"
      ).pipe(Effect.provide(ConfigProvider.layer(makeConfigProvider())))
    );

    expect(config.tenantStageAlias).toMatch(/^s-[a-f0-9]{12}$/);
    expect(config.tenantStageAlias?.length).toBeLessThanOrEqual(14);
    expect(
      `example-org--${config.tenantStageAlias}.example.com`.split(".")[0]
    ).toHaveLength(27);
    expect(
      `${"a".repeat(40)}--${config.tenantStageAlias}`.length
    ).toBeLessThanOrEqual(63);
  });

  it("disables auth rate limits by default for PR preview stages", () => {
    const config = Effect.runSync(
      loadInfraStageConfig("pr-104").pipe(
        Effect.provide(ConfigProvider.layer(makeConfigProvider()))
      )
    );

    expect(config.authRateLimitEnabled).toBeFalsy();
  });

  it("allows PR preview auth rate limits to be enabled explicitly", () => {
    const config = Effect.runSync(
      loadInfraStageConfig("pr-104").pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                AUTH_EMAIL_FROM: "no-reply@example.com",
                AUTH_RATE_LIMIT_ENABLED: "true",
                CEIRD_ZONE_NAME: "example.com",
                GOOGLE_MAPS_API_KEY: "google-key",
              },
            })
          )
        )
      )
    );

    expect(config.authRateLimitEnabled).toBeTruthy();
  });

  it("allows provider-normalized Hyperdrive and Neon retention settings to be overridden", () => {
    const config = Effect.runSync(
      loadInfraStageConfig("main").pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                AUTH_EMAIL_FROM: "no-reply@example.com",
                CEIRD_HYPERDRIVE_NAME: "ceird-main-postgres",
                CEIRD_NEON_HISTORY_RETENTION_SECONDS: "86400",
                GOOGLE_MAPS_API_KEY: "google-key",
              },
            })
          )
        )
      )
    );

    expect(config.hyperdriveName).toBe("ceird-main-postgres");
    expect(config.neonHistoryRetentionSeconds).toBe(86_400);
  });

  it("allows deployed MCP authorized app cache settings to be overridden", () => {
    const config = Effect.runSync(
      loadInfraStageConfig("main").pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                AUTH_EMAIL_FROM: "no-reply@example.com",
                CEIRD_MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES: "32",
                CEIRD_MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS: "45",
                GOOGLE_MAPS_API_KEY: "google-key",
              },
            })
          )
        )
      )
    );

    expect(config.mcpAuthorizedAppCacheMaxEntries).toBe(32);
    expect(config.mcpAuthorizedAppCacheTtlSeconds).toBe(45);
  });

  it("allows the deployed Agent action-run stale window to be overridden", () => {
    const config = Effect.runSync(
      loadInfraStageConfig("main").pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                AUTH_EMAIL_FROM: "no-reply@example.com",
                CEIRD_AGENT_ACTION_RUN_STALE_AFTER_SECONDS: "120",
                GOOGLE_MAPS_API_KEY: "google-key",
              },
            })
          )
        )
      )
    );

    expect(config.agentActionRunStaleAfterSeconds).toBe(120);
  });

  it("allows parent Neon branch protection to be enabled explicitly", () => {
    const config = Effect.runSync(
      loadInfraStageConfig("main").pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                AUTH_EMAIL_FROM: "no-reply@example.com",
                CEIRD_NEON_PARENT_BRANCH_PROTECTED: "true",
                GOOGLE_MAPS_API_KEY: "google-key",
              },
            })
          )
        )
      )
    );

    expect(config.neonParentBranchProtected).toBeTruthy();
  });
});

function makeConfigProvider() {
  return ConfigProvider.fromEnv({
    env: {
      AUTH_EMAIL_FROM: "no-reply@example.com",
      CEIRD_ZONE_NAME: "example.com",
      GOOGLE_MAPS_API_KEY: "google-key",
    },
  });
}
