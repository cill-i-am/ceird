import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as DrizzleProviders from "alchemy/Drizzle/Providers";
import * as Neon from "alchemy/Neon";
import { Stack } from "alchemy/Stack";
import type { StackServices } from "alchemy/Stack";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  makeCloudflareHyperdrive,
  makeCloudflareStack,
} from "./infra/cloudflare-stack.ts";
import { legacyDrizzleMigrationsProvider } from "./infra/legacy-alchemy.ts";
import { makeNeonPostgresResources } from "./infra/neon.ts";
import { loadInfraStageConfig } from "./infra/stages.ts";

const stackName = "ceird";

const providers = (() => {
  const cloudflareProviders = Cloudflare.providers();
  return Layer.mergeAll(
    cloudflareProviders,
    DrizzleProviders.providers(),
    legacyDrizzleMigrationsProvider,
    Neon.providers()
  ).pipe(Layer.orDie) as Layer.Layer<unknown, never, StackServices>;
})();

export default Alchemy.Stack(
  stackName,
  {
    providers,
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const currentStack = yield* Stack;
    const config = yield* loadInfraStageConfig(currentStack.stage);
    yield* Effect.annotateCurrentSpan("stage", config.stage);
    yield* Effect.annotateCurrentSpan("appHostname", config.appHostname);
    yield* Effect.annotateCurrentSpan("apiHostname", config.apiHostname);
    yield* Effect.annotateCurrentSpan(
      "neonParentStage",
      config.neonParentStage
    );

    const database = yield* makeNeonPostgresResources(config);
    yield* Effect.annotateCurrentSpan("databaseName", database.databaseName);
    yield* Effect.annotateCurrentSpan("neonBranchId", database.branch.branchId);

    const hyperdrive = yield* makeCloudflareHyperdrive({ config, database });

    const cloudflareStack = yield* makeCloudflareStack({
      config,
      database,
      hyperdrive,
    });

    return {
      api: cloudflareStack.apiOrigin,
      app: cloudflareStack.appOrigin,
      authEmailDeadLetterQueue:
        cloudflareStack.authEmailDeadLetterQueue.queueName,
      authEmailQueue: cloudflareStack.authEmailQueue.queueName,
      branch: database.branch.branchName,
      hyperdrive: cloudflareStack.database.name,
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
