import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { makeNeonPostgresConfig, NeonDirectDatabaseUrl } from "./neon.ts";

function neonDatabaseUrl(value: string) {
  return Redacted.make(Schema.decodeUnknownSync(NeonDirectDatabaseUrl)(value));
}

function uncheckedNeonDatabaseUrl(value: string) {
  return Redacted.make(value as NeonDirectDatabaseUrl);
}

describe("Neon Postgres config", () => {
  it.each([
    [
      "pooled Neon host",
      "postgresql://app:secret@ep-white-field-pooler.eu-west-2.aws.neon.tech/ceird?sslmode=require",
    ],
    [
      "non-Neon host",
      "postgresql://app:secret@example.com/ceird?sslmode=require",
    ],
    [
      "non-Postgres protocol",
      "mysql://app:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require",
    ],
    [
      "missing database name",
      "postgresql://app:secret@ep-white-field.eu-west-2.aws.neon.tech/?sslmode=require",
    ],
    ["malformed URL", "not-a-url"],
    [
      "missing username",
      "postgresql://:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require",
    ],
    [
      "missing password",
      "postgresql://app@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require",
    ],
    [
      "missing sslmode",
      "postgresql://app:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird",
    ],
    [
      "unsafe sslmode",
      "postgresql://app:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=disable",
    ],
  ])("rejects invalid direct Neon URL shape: %s", (_label, url) => {
    expect(() => Schema.decodeUnknownSync(NeonDirectDatabaseUrl)(url)).toThrow(
      /direct postgres Neon host/
    );
  });

  it("uses the app connection URL for migrations when no migration URL is configured", () => {
    const config = Effect.runSync(
      makeNeonPostgresConfig({
        appDatabaseUrl: neonDatabaseUrl(
          "postgresql://app:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require"
        ),
        migrationDatabaseUrl: undefined,
        requireMigrationDatabaseUrl: false,
      })
    );

    expect(config.databaseName).toBe("ceird");
    expect(config.hyperdriveOrigin).toStrictEqual({
      database: "ceird",
      host: "ep-white-field.eu-west-2.aws.neon.tech",
      password: Redacted.make("secret"),
      port: 5432,
      scheme: "postgres",
      user: "app",
    });
    expect(config.hyperdriveOriginCredentialFingerprint).toMatch(
      /^sha256:[a-f0-9]{64}$/
    );
    expect(Redacted.value(config.appRole.connectionUrl)).toBe(
      "postgresql://app:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require"
    );
    expect(Redacted.value(config.migrationRole.connectionUrl)).toBe(
      "postgresql://app:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require"
    );
  });

  it("requires a separate migration URL when migrations are enabled", () => {
    expect(() =>
      Effect.runSync(
        makeNeonPostgresConfig({
          appDatabaseUrl: neonDatabaseUrl(
            "postgresql://app:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require"
          ),
          migrationDatabaseUrl: undefined,
          requireMigrationDatabaseUrl: true,
        })
      )
    ).toThrow(/NEON_MIGRATION_DATABASE_URL is required/);
  });

  it("uses a distinct credential fingerprint when the app password changes", () => {
    const first = Effect.runSync(
      makeNeonPostgresConfig({
        appDatabaseUrl: neonDatabaseUrl(
          "postgresql://app:first@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require"
        ),
        migrationDatabaseUrl: undefined,
        requireMigrationDatabaseUrl: false,
      })
    );
    const second = Effect.runSync(
      makeNeonPostgresConfig({
        appDatabaseUrl: neonDatabaseUrl(
          "postgresql://app:second@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require"
        ),
        migrationDatabaseUrl: undefined,
        requireMigrationDatabaseUrl: false,
      })
    );

    expect(first.hyperdriveOriginCredentialFingerprint).not.toBe(
      second.hyperdriveOriginCredentialFingerprint
    );
  });

  it("decodes percent-encoded origin credentials without including query params", () => {
    const config = Effect.runSync(
      makeNeonPostgresConfig({
        appDatabaseUrl: neonDatabaseUrl(
          "postgresql://app%20user:s%40cret@ep-white-field.eu-west-2.aws.neon.tech:6543/ceird?sslmode=verify-full&channel_binding=require"
        ),
        migrationDatabaseUrl: undefined,
        requireMigrationDatabaseUrl: false,
      })
    );

    expect(config.hyperdriveOrigin).toStrictEqual({
      database: "ceird",
      host: "ep-white-field.eu-west-2.aws.neon.tech",
      password: Redacted.make("s@cret"),
      port: 6543,
      scheme: "postgres",
      user: "app user",
    });
  });

  it("rejects pooled Neon URLs so Hyperdrive receives a direct origin", () => {
    expect(() =>
      Effect.runSync(
        makeNeonPostgresConfig({
          appDatabaseUrl: uncheckedNeonDatabaseUrl(
            "postgresql://app:secret@ep-white-field-pooler.eu-west-2.aws.neon.tech/ceird?sslmode=require"
          ),
          migrationDatabaseUrl: undefined,
          requireMigrationDatabaseUrl: false,
        })
      )
    ).toThrow(/direct Neon connection URL/);
  });

  it("rejects migration URLs that point at a different Neon database", () => {
    expect(() =>
      Effect.runSync(
        makeNeonPostgresConfig({
          appDatabaseUrl: neonDatabaseUrl(
            "postgresql://app:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require"
          ),
          migrationDatabaseUrl: uncheckedNeonDatabaseUrl(
            "postgresql://migration:secret@ep-white-field.eu-west-2.aws.neon.tech/other?sslmode=require"
          ),
          requireMigrationDatabaseUrl: false,
        })
      )
    ).toThrow(/same Neon host and database/);
  });

  it("allows migration URLs with different credentials for the same Neon database", () => {
    const config = Effect.runSync(
      makeNeonPostgresConfig({
        appDatabaseUrl: neonDatabaseUrl(
          "postgresql://app:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require"
        ),
        migrationDatabaseUrl: neonDatabaseUrl(
          "postgresql://migration:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require&application_name=migrator"
        ),
        requireMigrationDatabaseUrl: false,
      })
    );

    expect(Redacted.value(config.migrationRole.connectionUrl)).toContain(
      "migration:secret"
    );
  });

  it("allows migration URLs when migrations require a separate role", () => {
    const config = Effect.runSync(
      makeNeonPostgresConfig({
        appDatabaseUrl: neonDatabaseUrl(
          "postgresql://app:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require"
        ),
        migrationDatabaseUrl: neonDatabaseUrl(
          "postgresql://migration:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require&application_name=migrator"
        ),
        requireMigrationDatabaseUrl: true,
      })
    );

    expect(Redacted.value(config.migrationRole.connectionUrl)).toContain(
      "migration:secret"
    );
  });
});
