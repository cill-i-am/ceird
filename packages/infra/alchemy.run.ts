import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import type { Input } from "alchemy/Input";
import type { StackServices } from "alchemy/Stack";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { HyperdriveProvider } from "./src/cloudflare-hyperdrive.ts";
import {
  makeCloudflareHyperdrive,
  makeCloudflareStack,
} from "./src/cloudflare-stack.ts";
import {
  DrizzleMigrations,
  DrizzleMigrationsProvider,
} from "./src/drizzle-migrations.ts";
import { makeNeonPostgresConfig } from "./src/neon.ts";
import { loadInfraStageConfig } from "./src/stages.ts";

const stackName = process.env.CEIRD_ALCHEMY_STACK_NAME ?? "ceird";

const providers = (() => {
  const cloudflareProviders = Cloudflare.providers();
  // Alchemy beta provider inference keeps the Cloudflare environment service in
  // the merged layer's input even after it has been provided to Hyperdrive.
  // Keep the cast isolated at the provider assembly boundary.
  return Layer.mergeAll(
    cloudflareProviders,
    HyperdriveProvider().pipe(Layer.provide(cloudflareProviders)),
    DrizzleMigrationsProvider()
  ).pipe(Layer.orDie) as Layer.Layer<unknown, never, StackServices>;
})();

export default Alchemy.Stack(
  stackName,
  {
    providers,
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const config = yield* loadInfraStageConfig;
    yield* Effect.annotateCurrentSpan("stage", config.stage);
    yield* Effect.annotateCurrentSpan("appHostname", config.appHostname);
    yield* Effect.annotateCurrentSpan("apiHostname", config.apiHostname);
    yield* Effect.annotateCurrentSpan(
      "applyMigrations",
      config.applyMigrations
    );

    const database = yield* makeNeonPostgresConfig({
      appDatabaseUrl: config.neonDatabaseUrl,
      migrationDatabaseUrl: config.neonMigrationDatabaseUrl,
      requireMigrationDatabaseUrl: config.applyMigrations,
    });
    yield* Effect.annotateCurrentSpan("databaseName", database.databaseName);

    const hyperdrive = yield* makeCloudflareHyperdrive({ config, database });

    let migrationRunId: Input<string> | undefined;
    if (config.applyMigrations) {
      const runId = new Date().toISOString();
      yield* Effect.annotateCurrentSpan("migrationRunId", runId);
      yield* Effect.annotateCurrentSpan(
        "migrationHyperdriveId",
        hyperdrive.hyperdriveId
      );
      yield* Effect.annotateCurrentSpan(
        "migrationsFolder",
        "../../apps/api/drizzle"
      );

      const migrations = yield* DrizzleMigrations("DrizzleMigrations", {
        databaseUrl: database.migrationRole.connectionUrl,
        hyperdriveId: hyperdrive.hyperdriveId,
        migrationsFolder: "../../apps/api/drizzle",
        runId,
      });
      migrationRunId = migrations.runId;
    }

    const stack = yield* makeCloudflareStack({
      config,
      database,
      hyperdrive,
      migrationRunId,
    });

    return {
      api: stack.api.url,
      app: stack.app.url,
      hyperdrive: stack.database.name,
      neonDatabase: database.databaseName,
    } as const;
  }).pipe(
    Effect.withSpan("InfraStack.deploy", {
      attributes: {
        stackName,
      },
    }),
    Effect.orDie
  )
);
