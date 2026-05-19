import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { InfraGoogleMapsApiKey } from "./stages.ts";
import type { InfraStageConfig } from "./stages.ts";

export const configWithoutCloudflareBootstrapSecrets = {
  appName: "ceird",
  apiHostname: "api.example.com",
  appHostname: "app.example.com",
  authEmailFrom: Redacted.make("no-reply@example.com"),
  authEmailFromName: "Ceird",
  authRateLimitEnabled: true,
  googleMapsApiKey: Redacted.make(
    Schema.decodeUnknownSync(InfraGoogleMapsApiKey)("google-key")
  ),
  hyperdriveName: "ceird-production-postgres",
  hyperdriveOriginConnectionLimit: 5,
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
  zoneName: "example.com",
} satisfies InfraStageConfig;

void configWithoutCloudflareBootstrapSecrets;
