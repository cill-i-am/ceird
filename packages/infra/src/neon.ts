import { createHash } from "node:crypto";

import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import type { HyperdriveOrigin } from "./cloudflare-hyperdrive.ts";

export const NeonDirectDatabaseUrl = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter((value) =>
      isNeonDirectDatabaseUrl(value)
        ? undefined
        : "Neon database URLs must use a direct postgres Neon host with credentials, a database name, and sslmode=require or sslmode=verify-full"
    )
  ),
  Schema.brand("@ceird/infra/NeonDirectDatabaseUrl")
);
export type NeonDirectDatabaseUrl = Schema.Schema.Type<
  typeof NeonDirectDatabaseUrl
>;

export interface NeonPostgresConnectionRole {
  readonly connectionUrl: Redacted.Redacted<NeonDirectDatabaseUrl>;
}

export interface NeonPostgresResources {
  readonly databaseName: string;
  readonly appRole: NeonPostgresConnectionRole;
  readonly hyperdriveOrigin: HyperdriveOrigin;
  readonly hyperdriveOriginCredentialFingerprint: string;
  readonly migrationRole: NeonPostgresConnectionRole;
}

export interface NeonPostgresConfigInput {
  readonly appDatabaseUrl: Redacted.Redacted<NeonDirectDatabaseUrl>;
  readonly migrationDatabaseUrl:
    | Redacted.Redacted<NeonDirectDatabaseUrl>
    | undefined;
  readonly requireMigrationDatabaseUrl: boolean;
}

export class NeonPostgresConfigError extends Schema.TaggedErrorClass<NeonPostgresConfigError>()(
  "@ceird/infra/NeonPostgresConfigError",
  {
    message: Schema.String,
    envName: Schema.optional(Schema.String),
  }
) {}

export function makeNeonPostgresConfig(
  input: NeonPostgresConfigInput
): Effect.Effect<NeonPostgresResources, NeonPostgresConfigError> {
  const appDatabaseUrl = Redacted.value(input.appDatabaseUrl);
  if (
    input.requireMigrationDatabaseUrl &&
    input.migrationDatabaseUrl === undefined
  ) {
    return Effect.fail(
      new NeonPostgresConfigError({
        envName: "NEON_MIGRATION_DATABASE_URL",
        message:
          "NEON_MIGRATION_DATABASE_URL is required when CEIRD_APPLY_MIGRATIONS=true.",
      })
    );
  }

  const migrationDatabaseUrl =
    input.migrationDatabaseUrl === undefined
      ? appDatabaseUrl
      : Redacted.value(input.migrationDatabaseUrl);

  return Effect.gen(function* () {
    const appConnection = yield* parseNeonDirectDatabaseUrl(
      appDatabaseUrl,
      "NEON_DATABASE_URL"
    );
    const migrationConnection = yield* parseNeonDirectDatabaseUrl(
      migrationDatabaseUrl,
      "NEON_MIGRATION_DATABASE_URL"
    );

    yield* assertSameNeonDatabase(appConnection, migrationConnection);

    return {
      appRole: {
        connectionUrl: input.appDatabaseUrl,
      },
      databaseName: appConnection.databaseName,
      hyperdriveOrigin: appConnection.hyperdriveOrigin,
      hyperdriveOriginCredentialFingerprint:
        appConnection.credentialFingerprint,
      migrationRole: {
        connectionUrl:
          input.migrationDatabaseUrl ?? Redacted.make(migrationDatabaseUrl),
      },
    };
  });
}

function assertSameNeonDatabase(
  appConnection: ParsedNeonDirectDatabaseUrl,
  migrationConnection: ParsedNeonDirectDatabaseUrl
): Effect.Effect<void, NeonPostgresConfigError> {
  if (
    appConnection.url.hostname !== migrationConnection.url.hostname ||
    appConnection.databaseName !== migrationConnection.databaseName
  ) {
    return Effect.fail(
      new NeonPostgresConfigError({
        envName: "NEON_MIGRATION_DATABASE_URL",
        message:
          "NEON_MIGRATION_DATABASE_URL must target the same Neon host and database as NEON_DATABASE_URL.",
      })
    );
  }
  return Effect.void;
}

interface ParsedNeonDirectDatabaseUrl {
  readonly credentialFingerprint: string;
  readonly databaseName: string;
  readonly hyperdriveOrigin: HyperdriveOrigin;
  readonly url: URL;
}

function parseNeonDirectDatabaseUrl(
  connectionUrl: NeonDirectDatabaseUrl,
  envName: string
): Effect.Effect<ParsedNeonDirectDatabaseUrl, NeonPostgresConfigError> {
  return Effect.gen(function* () {
    const url = yield* parsePostgresConnectionUrl(connectionUrl, envName);

    if (!url.hostname.endsWith(".neon.tech")) {
      return yield* neonConfigError(
        envName,
        `${envName} must point at a Neon postgres host.`
      );
    }

    if (url.hostname.includes("-pooler.")) {
      return yield* neonConfigError(
        envName,
        `${envName} must use a direct Neon connection URL; Cloudflare Hyperdrive provides pooling.`
      );
    }

    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    if (user.length === 0 || password.length === 0) {
      return yield* neonConfigError(
        envName,
        `${envName} must include a Neon role and password.`
      );
    }

    if (!hasApprovedSslMode(url)) {
      return yield* neonConfigError(
        envName,
        `${envName} must include sslmode=require or sslmode=verify-full.`
      );
    }

    const databaseName = decodeURIComponent(url.pathname.slice(1));
    if (databaseName.length === 0) {
      return yield* neonConfigError(
        envName,
        `${envName} must include a database name.`
      );
    }

    return {
      credentialFingerprint: makeCredentialFingerprint(url),
      databaseName,
      hyperdriveOrigin: {
        database: databaseName,
        host: url.hostname,
        password: Redacted.make(password),
        port: Number.parseInt(url.port || "5432", 10),
        scheme: "postgres",
        user,
      },
      url,
    };
  });
}

function parsePostgresConnectionUrl(
  connectionUrl: string,
  envName: string
): Effect.Effect<URL, NeonPostgresConfigError> {
  if (!URL.canParse(connectionUrl)) {
    return neonConfigError(envName, `${envName} must be a valid URL.`);
  }

  const url = new URL(connectionUrl);

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    return neonConfigError(
      envName,
      `${envName} must use postgres or postgresql.`
    );
  }

  return Effect.succeed(url);
}

function isNeonDirectDatabaseUrl(connectionUrl: string) {
  if (!URL.canParse(connectionUrl)) {
    return false;
  }
  const url = new URL(connectionUrl);
  return (
    (url.protocol === "postgresql:" || url.protocol === "postgres:") &&
    url.hostname.endsWith(".neon.tech") &&
    !url.hostname.includes("-pooler.") &&
    decodeURIComponent(url.username).length > 0 &&
    decodeURIComponent(url.password).length > 0 &&
    decodeURIComponent(url.pathname.slice(1)).length > 0 &&
    hasApprovedSslMode(url)
  );
}

function hasApprovedSslMode(url: URL) {
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
  return sslMode === "require" || sslMode === "verify-full";
}

function makeCredentialFingerprint(url: URL) {
  const hash = createHash("sha256")
    .update(url.hostname)
    .update("\0")
    .update(decodeURIComponent(url.username))
    .update("\0")
    .update(decodeURIComponent(url.password))
    .digest("hex");
  return `sha256:${hash}`;
}

function neonConfigError(envName: string, message: string) {
  return Effect.fail(
    new NeonPostgresConfigError({
      envName,
      message,
    })
  );
}
