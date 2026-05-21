/// <reference types="@cloudflare/workers-types" />

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import type { Input, InputProps } from "alchemy/Input";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";

import { makeAgentWorker } from "../apps/agent/infra/cloudflare-worker.ts";
import { makeApiWorker } from "../apps/api/infra/cloudflare-worker.ts";
import { makeAppWorker } from "../apps/app/infra/cloudflare-vite.ts";
import { makeDomainWorker } from "../apps/domain/infra/cloudflare-worker.ts";
import { makeMcpWorker } from "../apps/mcp/infra/cloudflare-worker.ts";
import type { NeonPostgresResources } from "./neon.ts";
import type { InfraStageConfig } from "./stages.ts";
import { resourceName } from "./stages.ts";

export interface CloudflareStackInput {
  readonly config: InfraStageConfig;
  readonly database: NeonPostgresResources;
  readonly hyperdrive: Cloudflare.Hyperdrive;
}

export function makeCloudflareWorkerOrigin(input: {
  readonly domains: readonly {
    readonly hostname: string;
    readonly id?: string;
    readonly zoneId?: string;
  }[];
  readonly fallbackHostname: string;
}) {
  return `https://${input.domains[0]?.hostname ?? input.fallbackHostname}`;
}

export function makeCloudflareHyperdrive(input: {
  readonly config: InfraStageConfig;
  readonly database: NeonPostgresResources;
}) {
  return Cloudflare.Hyperdrive(
    "PostgresHyperdrive",
    makeCloudflareHyperdriveProps({
      config: input.config,
      origin: input.database.hyperdriveOrigin,
    })
  );
}

export function makeCloudflareHyperdriveProps(input: {
  readonly config: InfraStageConfig;
  readonly origin: Input<Cloudflare.HyperdriveOrigin>;
}) {
  return {
    name: input.config.hyperdriveName,
    origin: input.origin,
    originConnectionLimit: input.config.hyperdriveOriginConnectionLimit,
    caching: { disabled: true },
  } satisfies InputProps<Cloudflare.HyperdriveProps>;
}

export const makeCloudflareStack = Effect.fn("CloudflareStack.make")(function* (
  input: CloudflareStackInput
) {
  yield* Effect.annotateCurrentSpan("stage", input.config.stage);
  yield* Effect.annotateCurrentSpan("appHostname", input.config.appHostname);
  yield* Effect.annotateCurrentSpan("apiHostname", input.config.apiHostname);
  yield* Effect.annotateCurrentSpan(
    "agentHostname",
    input.config.agentHostname
  );
  yield* Effect.annotateCurrentSpan("mcpHostname", input.config.mcpHostname);
  yield* Effect.annotateCurrentSpan(
    "hyperdriveId",
    input.hyperdrive.hyperdriveId
  );

  const betterAuthSecret = yield* Alchemy.Random("BetterAuthSecret", {
    bytes: 32,
  });
  const agentInternalSecret = yield* Alchemy.Random("AgentInternalSecret", {
    bytes: 32,
  });

  const authEmailDeadLetterQueue = yield* Cloudflare.Queue(
    "AuthEmailDeadLetterQueue",
    {
      name: resourceName(input.config, "auth-email-dlq"),
    }
  );

  const authEmailQueue = yield* Cloudflare.Queue("AuthEmailQueue", {
    name: resourceName(input.config, "auth-email"),
  });

  const domain = yield* makeDomainWorker({
    agentInternalSecret: agentInternalSecret.text,
    authEmailQueue,
    betterAuthSecret: betterAuthSecret.text,
    config: input.config,
    hyperdrive: input.hyperdrive,
    name: resourceName(input.config, "domain"),
  });

  const api = yield* makeApiWorker({
    domain,
    hostname: input.config.apiHostname,
    name: resourceName(input.config, "api"),
  });

  yield* Cloudflare.QueueConsumer("AuthEmailConsumer", {
    queueId: authEmailQueue.queueId,
    scriptName: domain.workerName,
    deadLetterQueue: authEmailDeadLetterQueue.queueName,
    settings: {
      batchSize: 10,
      maxRetries: 5,
      maxWaitTimeMs: 2000,
      retryDelay: 30,
    },
  });

  const apiOrigin = api.domains.pipe(
    Output.map((domains) =>
      makeCloudflareWorkerOrigin({
        domains,
        fallbackHostname: input.config.apiHostname,
      })
    )
  );

  const mcp = yield* makeMcpWorker({
    domain,
    hostname: input.config.mcpHostname,
    name: resourceName(input.config, "mcp"),
  });

  const mcpOrigin = mcp.domains.pipe(
    Output.map((domains) =>
      makeCloudflareWorkerOrigin({
        domains,
        fallbackHostname: input.config.mcpHostname,
      })
    )
  );

  const agentAi = yield* Cloudflare.AiGateway("AgentAiGateway", {
    id: resourceName(input.config, "agent"),
    collectLogs: false,
  });

  const agent = yield* makeAgentWorker({
    agentInternalSecret: agentInternalSecret.text,
    ai: agentAi,
    config: input.config,
    domain,
    hostname: input.config.agentHostname,
    name: resourceName(input.config, "agent"),
  });

  const agentOrigin = agent.domains.pipe(
    Output.map((domains) =>
      makeCloudflareWorkerOrigin({
        domains,
        fallbackHostname: input.config.agentHostname,
      })
    )
  );

  const app = yield* makeAppWorker({
    agentOrigin,
    apiOrigin,
    hostname: input.config.appHostname,
    name: resourceName(input.config, "app"),
  });

  const appOrigin = app.domains.pipe(
    Output.map((domains) =>
      makeCloudflareWorkerOrigin({
        domains,
        fallbackHostname: input.config.appHostname,
      })
    )
  );

  return {
    api,
    apiOrigin,
    agent,
    agentAi,
    agentOrigin,
    app,
    appOrigin,
    authEmailDeadLetterQueue,
    authEmailQueue,
    database: input.hyperdrive,
    domain,
    mcp,
    mcpOrigin,
  } as const;
});
