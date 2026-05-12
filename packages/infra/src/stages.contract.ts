import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { InfraGoogleMapsApiKey } from "./stages.ts";
import type { InfraStageConfig } from "./stages.ts";

const configWithoutCloudflareBootstrapSecrets = {
  appName: "ceird",
  applyMigrations: false,
  apiHostname: "api.example.com",
  appHostname: "app.example.com",
  authEmailFrom: Redacted.make("no-reply@example.com"),
  authEmailFromName: "Ceird",
  authEmailTransport: "cloudflare-binding",
  googleMapsApiKey: Redacted.make(
    Schema.decodeUnknownSync(InfraGoogleMapsApiKey)("google-key")
  ),
  hyperdriveOriginConnectionLimit: 5,
  planetScaleClusterSize: "PS-5",
  planetScaleDatabaseName: "ceird-production",
  planetScaleDefaultBranch: "main",
  planetScaleOrganization: "example",
  planetScaleRegionSlug: "eu-west",
  stage: "production",
  zoneName: "example.com",
} satisfies InfraStageConfig;

void configWithoutCloudflareBootstrapSecrets;
