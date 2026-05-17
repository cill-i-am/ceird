import type * as Cloudflare from "alchemy/Cloudflare";
import * as DrizzleSchema from "alchemy/Drizzle/Schema";
import type { Input } from "alchemy/Input";
import * as Neon from "alchemy/Neon";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";

import type { InfraStageConfig } from "./stages.ts";
import {
  apiAlchemyDrizzleMigrationsDir,
  apiDrizzleMigrationsDir,
  apiDrizzleSchemaPath,
  makeAlchemyStageIdentity,
  resourceName,
} from "./stages.ts";

export interface AlchemyDrizzleSchemaMigrationSource {
  readonly dialect: "postgres";
  readonly kind: "alchemy-drizzle-schema";
  readonly migrationsDir: string;
  readonly out: string;
  readonly schema: string;
}

export type NeonMigrationSource = AlchemyDrizzleSchemaMigrationSource;

export interface NeonPostgresLayout {
  readonly branch: {
    readonly migrationSource: NeonMigrationSource;
    readonly name: string;
    readonly parentBranchName: string | undefined;
    readonly protected: boolean;
  };
  readonly project:
    | {
        readonly kind: "create";
        readonly databaseName: string;
        readonly defaultBranchName: string;
        readonly name: string;
        readonly orgId: string | undefined;
        readonly pgVersion: Neon.NeonPgVersion;
        readonly region: Neon.NeonRegion;
        readonly roleName: string;
      }
    | {
        readonly kind: "reference";
        readonly stage: string;
      };
}

export interface NeonPostgresResources {
  readonly branch: Neon.Branch;
  readonly databaseName: Input<string>;
  readonly hyperdriveOrigin: Input<Cloudflare.HyperdriveOrigin>;
  readonly migrationSchema: DrizzleSchema.Schema;
  readonly project: Neon.Project;
}

export function makeNeonPostgresLayout(
  config: InfraStageConfig
): NeonPostgresLayout {
  const identity = makeAlchemyStageIdentity({
    appName: config.appName,
    productionStage: config.neonParentStage,
    stage: config.stage,
  });

  return {
    branch: {
      migrationSource: {
        dialect: "postgres",
        kind: "alchemy-drizzle-schema",
        migrationsDir: apiDrizzleMigrationsDir,
        out: apiAlchemyDrizzleMigrationsDir,
        schema: apiDrizzleSchemaPath,
      },
      name: identity.neonBranchName,
      parentBranchName: identity.isProduction
        ? undefined
        : config.neonParentBranchName,
      protected: identity.isProduction,
    },
    project: identity.isProduction
      ? {
          kind: "create",
          databaseName: config.neonDatabaseName,
          defaultBranchName: config.neonDefaultBranchName,
          name: resourceName(config, "postgres"),
          orgId: config.neonOrgId,
          pgVersion: config.neonPgVersion,
          region: config.neonRegion,
          roleName: config.neonRoleName,
        }
      : {
          kind: "reference",
          stage: config.neonParentStage,
        },
  };
}

export const makeNeonPostgresResources = Effect.fn("NeonPostgres.make")(
  function* (config: InfraStageConfig) {
    const layout = makeNeonPostgresLayout(config);
    const project =
      layout.project.kind === "create"
        ? yield* Neon.Project("PostgresProject", {
            databaseName: layout.project.databaseName,
            defaultBranchName: layout.project.defaultBranchName,
            name: layout.project.name,
            orgId: layout.project.orgId,
            pgVersion: layout.project.pgVersion,
            region: layout.project.region,
            roleName: layout.project.roleName,
          })
        : yield* Neon.Project.ref("PostgresProject", {
            stage: layout.project.stage,
          });
    const migrationSchema = yield* DrizzleSchema.Schema("DatabaseSchema", {
      dialect: layout.branch.migrationSource.dialect,
      out: layout.branch.migrationSource.out,
      schema: layout.branch.migrationSource.schema,
    });

    const branch = yield* Neon.Branch("PostgresBranch", {
      migrationsDir: migrationSchema.out.pipe(
        Output.map(() => layout.branch.migrationSource.migrationsDir)
      ),
      name: layout.branch.name,
      parentBranch:
        layout.branch.parentBranchName === undefined
          ? undefined
          : { name: layout.branch.parentBranchName },
      project,
      protected: layout.branch.protected,
    });

    return {
      branch,
      databaseName: branch.databaseName,
      hyperdriveOrigin: branch.origin,
      migrationSchema,
      project,
    } satisfies NeonPostgresResources;
  }
);
