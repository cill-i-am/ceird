import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
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
import {
  makePlanetScalePostgres,
  PlanetScaleProviders,
} from "./src/planet-scale.ts";
import { loadInfraStageConfig } from "./src/stages.ts";

const stackName =
  process.env.CEIRD_ALCHEMY_STACK_NAME ??
  process.env.CEIRD_ALCHEMY_STACK_NAME ??
  "ceird";

export default Alchemy.Stack(
  stackName,
  {
    providers: (() => {
      const cloudflareProviders = Cloudflare.providers();
      return Layer.mergeAll(
        cloudflareProviders,
        PlanetScaleProviders(),
        HyperdriveProvider().pipe(Layer.provide(cloudflareProviders)),
        DrizzleMigrationsProvider()
      ).pipe(Layer.orDie);
    })(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const config = yield* loadInfraStageConfig.pipe(Effect.orDie);
    const database = yield* makePlanetScalePostgres(config);
    const hyperdrive = yield* makeCloudflareHyperdrive({ config, database });

    let migrationRunId: (typeof hyperdrive)["hyperdriveId"] | undefined;
    if (config.applyMigrations) {
      const migrations = yield* DrizzleMigrations("DrizzleMigrations", {
        databaseUrl: database.migrationRole.connectionUrl,
        hyperdriveId: hyperdrive.hyperdriveId,
        migrationsFolder: "../../apps/api/drizzle",
        runId: new Date().toISOString(),
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
      planetScaleDatabase: database.database.name,
    } as const;
  })
);
