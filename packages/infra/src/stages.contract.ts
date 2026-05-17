import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { NeonDirectDatabaseUrl } from "./neon.ts";
import { InfraGoogleMapsApiKey } from "./stages.ts";
import type { InfraStageConfig } from "./stages.ts";

function neonDatabaseUrl(value: string) {
  return Redacted.make(Schema.decodeUnknownSync(NeonDirectDatabaseUrl)(value));
}

const configWithoutCloudflareBootstrapSecrets = {
  appName: "ceird",
  applyMigrations: false,
  apiHostname: "api.example.com",
  appHostname: "app.example.com",
  authEmailFrom: Redacted.make("no-reply@example.com"),
  authEmailFromName: "Ceird",
  googleMapsApiKey: Redacted.make(
    Schema.decodeUnknownSync(InfraGoogleMapsApiKey)("google-key")
  ),
  hyperdriveOriginConnectionLimit: 5,
  neonDatabaseUrl: neonDatabaseUrl(
    "postgresql://app:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require"
  ),
  neonMigrationDatabaseUrl: undefined,
  stage: "production",
  zoneName: "example.com",
} satisfies InfraStageConfig;

void configWithoutCloudflareBootstrapSecrets;
