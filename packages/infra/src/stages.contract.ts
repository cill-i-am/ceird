import * as Redacted from "effect/Redacted";

import type { InfraStageConfig } from "./stages.ts";

const configWithoutCloudflareBootstrapSecrets = {
  appName: "ceird",
  applyMigrations: false,
  apiHostname: "api.example.com",
  appHostname: "app.example.com",
  authEmailFrom: Redacted.make("no-reply@example.com"),
  authEmailFromName: "Ceird",
  authEmailTransport: "cloudflare-binding",
  hyperdriveOriginConnectionLimit: 5,
  planetScaleClusterSize: "PS-5",
  planetScaleDatabaseName: "ceird-production",
  planetScaleDefaultBranch: "main",
  planetScaleOrganization: "example",
  planetScaleRegionSlug: "eu-west",
  sentryDsn: "https://public@example.com/1",
  sentryTracesSampleRate: 1,
  siteGeocoderMode: "stub",
  stage: "production",
  zoneName: "example.com",
} satisfies InfraStageConfig;

void configWithoutCloudflareBootstrapSecrets;
