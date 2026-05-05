import { CredentialsFromEnv } from "@distilled.cloud/planetscale/Credentials";
import type {
  CreateDatabaseOutput,
  CreateRoleOutput,
  GetDatabaseOutput,
} from "@distilled.cloud/planetscale/Operations";
import * as Provider from "alchemy/Provider";
/* eslint-disable max-classes-per-file */
import { Resource } from "alchemy/Resource";
import type { Resource as AlchemyResource } from "alchemy/Resource";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import type { InfraStageConfig } from "./stages.ts";

export type PlanetScaleInheritedRole =
  | "pg_read_all_data"
  | "pg_write_all_data"
  | "postgres";

export class PlanetScaleBranchKindMismatchError extends Schema.TaggedErrorClass<PlanetScaleBranchKindMismatchError>()(
  "PlanetScaleBranchKindMismatchError",
  {
    branch: Schema.String,
    database: Schema.String,
    kind: Schema.String,
    message: Schema.String,
  }
) {}

export class PlanetScaleBranchNotReadyError extends Schema.TaggedErrorClass<PlanetScaleBranchNotReadyError>()(
  "PlanetScaleBranchNotReadyError",
  {
    branch: Schema.String,
    database: Schema.String,
    message: Schema.String,
  }
) {}

export interface PlanetScaleDatabaseProps {
  readonly organization: string;
  readonly name: string;
  readonly region: string;
  readonly clusterSize: string;
  readonly defaultBranch: string;
  readonly delete?: boolean;
}

export interface PlanetScaleDatabaseAttributes {
  readonly id: string;
  readonly name: string;
  readonly organization: string;
  readonly defaultBranch: string;
  readonly state: string;
}

export type PlanetScaleDatabase = AlchemyResource<
  "PlanetScale.Database",
  PlanetScaleDatabaseProps,
  PlanetScaleDatabaseAttributes
>;

export interface PlanetScaleRoleProps {
  readonly organization: string;
  readonly database: string;
  readonly branch: string;
  readonly inheritedRoles: readonly PlanetScaleInheritedRole[];
  readonly successor?: string;
  readonly ttl?: number;
  readonly delete?: boolean;
}

export interface PlanetScaleRoleAttributes {
  readonly id: string;
  readonly name: string;
  readonly organization: string;
  readonly database: string;
  readonly branch: string;
  readonly host: string;
  readonly username: string;
  readonly password: Redacted.Redacted<string>;
  readonly databaseName: string;
  readonly expiresAt: string;
  readonly inheritedRoles: readonly PlanetScaleInheritedRole[];
  readonly successor: string;
  readonly connectionUrl: Redacted.Redacted<string>;
  readonly connectionUrlPooled: Redacted.Redacted<string>;
}

export type PlanetScaleRole = AlchemyResource<
  "PlanetScale.Role",
  PlanetScaleRoleProps,
  PlanetScaleRoleAttributes
>;

export interface PlanetScalePostgresResources {
  readonly database: PlanetScaleDatabase;
  readonly appRole: PlanetScaleRole;
  readonly migrationRole: PlanetScaleRole;
}

export const PlanetScaleDatabase = Resource<PlanetScaleDatabase>(
  "PlanetScale.Database"
);
export const PlanetScaleRole = Resource<PlanetScaleRole>("PlanetScale.Role");

export const PlanetScaleProviders = () =>
  Layer.mergeAll(PlanetScaleDatabaseProvider(), PlanetScaleRoleProvider()).pipe(
    Layer.provideMerge(CredentialsFromEnv)
  );

export function makePlanetScalePostgres(config: InfraStageConfig) {
  return Effect.gen(function* () {
    const database = yield* PlanetScaleDatabase("Postgres", {
      organization: config.planetScaleOrganization,
      name: config.planetScaleDatabaseName,
      region: config.planetScaleRegionSlug,
      clusterSize: config.planetScaleClusterSize,
      defaultBranch: config.planetScaleDefaultBranch,
      delete: false,
    });

    const appRole = yield* PlanetScaleRole("PostgresAppRole", {
      organization: config.planetScaleOrganization,
      database: database.name,
      branch: database.defaultBranch,
      inheritedRoles: ["pg_read_all_data", "pg_write_all_data"],
      delete: false,
    });

    const migrationRole = yield* PlanetScaleRole("PostgresMigrationRole", {
      organization: config.planetScaleOrganization,
      database: database.name,
      branch: database.defaultBranch,
      inheritedRoles: ["postgres"],
      delete: false,
    });

    return { database, appRole, migrationRole } as const;
  });
}

const PlanetScaleDatabaseProvider = () =>
  Provider.succeed(PlanetScaleDatabase, {
    stables: ["id", "organization"],
    create: ({ news }) =>
      Effect.gen(function* () {
        const operations = yield* planetScaleOperations;
        const existing = yield* operations
          .getDatabase({
            organization: news.organization,
            database: news.name,
          })
          .pipe(Effect.catchTag("NotFound", () => Effect.succeed(null)));

        const database =
          existing ??
          (yield* operations.createDatabase({
            organization: news.organization,
            name: news.name,
            region: news.region,
            cluster_size: news.clusterSize,
            kind: "postgresql",
          }));

        return databaseAttributes(news, database);
      }),
    update: ({ news }) =>
      Effect.gen(function* () {
        const operations = yield* planetScaleOperations;
        const database = yield* operations.getDatabase({
          organization: news.organization,
          database: news.name,
        });
        return databaseAttributes(news, database);
      }),
    delete: ({ olds }) =>
      Effect.gen(function* () {
        const shouldDelete = yield* shouldDeleteProtectedResource(olds.delete);
        if (shouldDelete) {
          const operations = yield* planetScaleOperations;
          yield* operations
            .deleteDatabase({
              organization: olds.organization,
              database: olds.name,
            })
            .pipe(Effect.catchTag("NotFound", () => Effect.void));
        }
      }),
  });

const PlanetScaleRoleProvider = () =>
  Provider.succeed(PlanetScaleRole, {
    stables: ["id", "organization", "database", "branch"],
    create: ({ news }) =>
      Effect.gen(function* () {
        yield* waitForPlanetScalePostgresBranch(news);
        const operations = yield* planetScaleOperations;
        const role = yield* operations.createRole({
          organization: news.organization,
          database: news.database,
          branch: news.branch,
          ttl: news.ttl,
          inherited_roles: [...news.inheritedRoles],
        });
        return roleAttributes(news, role);
      }),
    update: ({ output }) => Effect.succeed(output),
    delete: ({ olds, output }) =>
      Effect.gen(function* () {
        const shouldDelete = yield* shouldDeleteProtectedResource(olds.delete);
        if (shouldDelete) {
          const operations = yield* planetScaleOperations;
          yield* operations
            .deleteRole({
              organization: olds.organization,
              database: olds.database,
              branch: olds.branch,
              id: output.id,
              successor: olds.successor ?? "postgres",
            })
            .pipe(Effect.catchTag("NotFound", () => Effect.void));
        }
      }),
  });

const protectedResourceDestroyEnabled = Config.boolean(
  "CEIRD_DESTROY_PROTECTED_RESOURCES"
).pipe(
  Config.orElse(() => Config.boolean("CEIRD_DESTROY_PROTECTED_RESOURCES")),
  Config.withDefault(false)
);

function shouldDeleteProtectedResource(deleteFlag: boolean | undefined) {
  return Effect.gen(function* () {
    const enabled = yield* protectedResourceDestroyEnabled;
    return deleteFlag === true || enabled;
  });
}

function databaseAttributes(
  props: PlanetScaleDatabaseProps,
  data: GetDatabaseOutput | CreateDatabaseOutput
): PlanetScaleDatabaseAttributes {
  return {
    id: data.id,
    name: data.name,
    organization: props.organization,
    defaultBranch: data.default_branch ?? props.defaultBranch,
    state: data.state ?? "unknown",
  };
}

function roleAttributes(
  props: PlanetScaleRoleProps,
  data: CreateRoleOutput
): PlanetScaleRoleAttributes {
  const password = encodeURIComponent(
    Redacted.value(data.password as Redacted.Redacted<string>)
  );
  const username = encodeURIComponent(data.username);
  const databaseName = encodeURIComponent(data.database_name);
  const connectionUrl = `postgresql://${username}:${password}@${data.access_host_url}:5432/${databaseName}?sslmode=verify-full`;
  const connectionUrlPooled = `postgresql://${username}:${password}@${data.access_host_url}:6432/${databaseName}?sslmode=verify-full`;

  return {
    id: data.id,
    name: data.name,
    organization: props.organization,
    database: props.database,
    branch: props.branch,
    host: data.access_host_url,
    username: data.username,
    password: data.password as Redacted.Redacted<string>,
    databaseName: data.database_name,
    expiresAt: data.expires_at ?? "",
    inheritedRoles: props.inheritedRoles,
    successor: props.successor ?? "postgres",
    connectionUrl: Redacted.make(connectionUrl),
    connectionUrlPooled: Redacted.make(connectionUrlPooled),
  };
}

function waitForPlanetScalePostgresBranch(props: PlanetScaleRoleProps) {
  return Effect.gen(function* () {
    const operations = yield* planetScaleOperations;
    const branch = yield* operations.getBranch({
      organization: props.organization,
      database: props.database,
      branch: props.branch,
    });
    if (branch.kind !== "postgresql") {
      return yield* Effect.fail(
        new PlanetScaleBranchKindMismatchError({
          branch: props.branch,
          database: props.database,
          kind: branch.kind,
          message: `PlanetScale branch "${props.database}/${props.branch}" is ${branch.kind}; PostgreSQL roles require a PostgreSQL database.`,
        })
      );
    }
    if (!branch.ready) {
      return yield* Effect.fail(
        new PlanetScaleBranchNotReadyError({
          branch: props.branch,
          database: props.database,
          message: `PlanetScale branch "${props.database}/${props.branch}" is not ready yet. Re-run alchemy deploy once PlanetScale reports the branch ready.`,
        })
      );
    }
  });
}

const planetScaleOperations = Effect.promise(
  () => import("@distilled.cloud/planetscale/Operations")
);
