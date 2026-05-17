import type * as Cloudflare from "alchemy/Cloudflare";
import type { Input } from "alchemy/Input";
import * as Neon from "alchemy/Neon";
import * as Effect from "effect/Effect";

import type { InfraStageConfig } from "./stages.ts";
import { makeAlchemyStageIdentity, resourceName } from "./stages.ts";

export interface CheckedInDrizzleSqlMigrationSource {
  readonly kind: "checked-in-drizzle-sql";
  readonly migrationsDir: string;
}

export type NeonMigrationSource = CheckedInDrizzleSqlMigrationSource;

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
        kind: "checked-in-drizzle-sql",
        migrationsDir: config.neonMigrationsDir,
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

    const branch = yield* Neon.Branch("PostgresBranch", {
      migrationsDir: resolveNeonMigrationSourceDir(
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
      project,
    } satisfies NeonPostgresResources;
  }
);

function resolveNeonMigrationSourceDir(source: NeonMigrationSource) {
  return source.migrationsDir;
}
