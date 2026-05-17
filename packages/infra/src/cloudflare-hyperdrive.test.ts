import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { hyperdriveBody } from "./cloudflare-hyperdrive.ts";
import { makeNeonPostgresConfig, NeonDirectDatabaseUrl } from "./neon.ts";

describe("Hyperdrive API body", () => {
  it("includes the configured origin connection limit", () => {
    expect(
      hyperdriveBody({
        caching: { disabled: true },
        name: "ceird-production-postgres",
        origin: {
          database: "ceird-production",
          host: "ep-white-field.eu-west-2.aws.neon.tech",
          password: Redacted.make("secret"),
          user: "ceird",
        },
        originCredentialFingerprint:
          "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        originConnectionLimit: 5,
      })
    ).toStrictEqual({
      caching: { disabled: true },
      name: "ceird-production-postgres",
      origin: {
        database: "ceird-production",
        host: "ep-white-field.eu-west-2.aws.neon.tech",
        password: "secret",
        port: 5432,
        scheme: "postgres",
        user: "ceird",
      },
      origin_connection_limit: 5,
    });
  });

  it("serializes a Hyperdrive body from a Neon connection URL without leaking the credential fingerprint", () => {
    const config = Effect.runSync(
      makeNeonPostgresConfig({
        appDatabaseUrl: Redacted.make(
          Schema.decodeUnknownSync(NeonDirectDatabaseUrl)(
            "postgresql://app:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require"
          )
        ),
        migrationDatabaseUrl: undefined,
        requireMigrationDatabaseUrl: false,
      })
    );

    expect(
      hyperdriveBody({
        caching: { disabled: true },
        name: "ceird-production-postgres",
        origin: config.hyperdriveOrigin,
        originCredentialFingerprint:
          config.hyperdriveOriginCredentialFingerprint,
        originConnectionLimit: 5,
      })
    ).toStrictEqual({
      caching: { disabled: true },
      name: "ceird-production-postgres",
      origin: {
        database: "ceird",
        host: "ep-white-field.eu-west-2.aws.neon.tech",
        password: "secret",
        port: 5432,
        scheme: "postgres",
        user: "app",
      },
      origin_connection_limit: 5,
    });
  });
});
