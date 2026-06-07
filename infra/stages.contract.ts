import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { InfraGoogleMapsApiKey } from "./stages.ts";
import type { InfraStageConfig } from "./stages.ts";

export const configWithoutCloudflareBootstrapSecrets = {
  agentActionRunStaleAfterSeconds: 900,
  appName: "ceird",
  agentHostname: "agent.example.com",
  apiHostname: "api.example.com",
  appHostname: "app.example.com",
  syncHostname: "sync.example.com",
  authCookieDomain: "example.com",
  authCookiePrefix: "ceird-main",
  authCaptchaEnabled: undefined,
  authCaptchaSiteVerifyUrlOverride: undefined,
  authCaptchaTurnstileSecretKey: undefined,
  authCaptchaTurnstileSiteKey: undefined,
  authEmailFrom: Redacted.make("no-reply@example.com"),
  authEmailFromName: "Ceird",
  authPasswordCompromiseCheckEnabled: undefined,
  authPasswordCompromiseCheckRangeUrlOverride: undefined,
  authRateLimitEnabled: true,
  authSecrets: undefined,
  googleMapsApiKey: Redacted.make(
    Schema.decodeUnknownSync(InfraGoogleMapsApiKey)("google-key")
  ),
  hyperdriveName: "ceird-production-postgres",
  hyperdriveOriginConnectionLimit: 5,
  electricContainerInstanceType: "basic",
  electricStorageAccessKeyId: undefined,
  electricStorageSecretAccessKey: undefined,
  mcpAuthorizedAppCacheMaxEntries: undefined,
  mcpAuthorizedAppCacheTtlSeconds: undefined,
  neonDatabaseName: "ceird",
  neonDefaultBranchName: "base",
  neonHistoryRetentionSeconds: 21_600,
  neonOrgId: undefined,
  neonParentBranchProtected: false,
  neonParentBranchName: "main",
  neonParentStage: "main",
  neonPgVersion: 17,
  neonRegion: "aws-eu-west-2",
  neonRoleName: "ceird",
  mcpHostname: "mcp.example.com",
  stage: "main",
  tenantBaseDomain: "example.com",
  tenantHostMode: "stage",
  tenantReservedHostnames: [
    "app.example.com",
    "api.example.com",
    "agent.example.com",
    "mcp.example.com",
    "sync.example.com",
  ],
  tenantRoutePattern: "*--main.example.com/*",
  tenantStageAlias: "main",
  tenantTrustedOriginPattern: "https://*--main.example.com",
  workerAnalyticsSampleRate: 0.1,
  zoneName: "example.com",
} satisfies InfraStageConfig;

void configWithoutCloudflareBootstrapSecrets;
