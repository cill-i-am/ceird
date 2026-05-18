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
  readonly appliedMigrationsDir: string;
  readonly dialect: "postgres";
  readonly generatedMigrationsDir: string;
  readonly kind: "alchemy-drizzle-schema";
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
        readonly historyRetentionSeconds: number;
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
        appliedMigrationsDir: apiDrizzleMigrationsDir,
        dialect: "postgres",
        generatedMigrationsDir: apiAlchemyDrizzleMigrationsDir,
        kind: "alchemy-drizzle-schema",
        schema: apiDrizzleSchemaPath,
      },
      name: identity.neonBranchName,
      parentBranchName: identity.isProduction
        ? undefined
        : config.neonParentBranchName,
      protected: identity.isProduction && config.neonParentBranchProtected,
    },
    project: identity.isProduction
      ? {
          kind: "create",
          databaseName: config.neonDatabaseName,
          defaultBranchName: config.neonDefaultBranchName,
          historyRetentionSeconds: config.neonHistoryRetentionSeconds,
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

function makeAppliedMigrationsDir(
  migrationSchema: DrizzleSchema.Schema,
  migrationSource: NeonMigrationSource
) {
  return migrationSchema.out.pipe(
    Output.map(() => migrationSource.appliedMigrationsDir)
  );
}

export const makeNeonPostgresResources = Effect.fn("NeonPostgres.make")(
  function* (config: InfraStageConfig) {
    const layout = makeNeonPostgresLayout(config);
    const project =
      layout.project.kind === "create"
        ? yield* Neon.Project("PostgresProject", {
            databaseName: layout.project.databaseName,
            defaultBranchName: layout.project.defaultBranchName,
            historyRetentionSeconds: layout.project.historyRetentionSeconds,
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
      out: layout.branch.migrationSource.generatedMigrationsDir,
      schema: layout.branch.migrationSource.schema,
    });

    const branch = yield* Neon.Branch("PostgresBranch", {
      migrationsDir: makeAppliedMigrationsDir(
        migrationSchema,
        layout.branch.migrationSource
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
