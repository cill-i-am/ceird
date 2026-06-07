/// <reference types="@cloudflare/workers-types" />

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import type { Input, InputProps } from "alchemy/Input";
import * as Output from "alchemy/Output";
import * as Array from "effect/Array";
import type * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import {
  makeAgentAiGatewayProps,
  makeAgentWorker,
} from "../apps/agent/infra/cloudflare-worker.ts";
import { makeApiWorker } from "../apps/api/infra/cloudflare-worker.ts";
import { makeAppWorker } from "../apps/app/infra/cloudflare-vite.ts";
import { makeDomainWorker } from "../apps/domain/infra/cloudflare-worker.ts";
import { makeMcpWorker } from "../apps/mcp/infra/cloudflare-worker.ts";
import { makeSyncWorker } from "../apps/sync/infra/cloudflare-worker.ts";
import type { ElectricContainerStorageConfig } from "../apps/sync/infra/cloudflare-worker.ts";
import {
  makeCloudflareR2BucketResourceKey,
  makeR2SecretAccessKey,
} from "./cloudflare-r2.ts";
import {
  TenantWildcardDnsRecord,
  TenantWorkerRoute,
} from "./cloudflare-tenant-routing.ts";
import type { NeonPostgresResources } from "./neon.ts";
import type { InfraStageConfig } from "./stages.ts";
import {
  makeAlchemyStageIdentity,
  makeInfraConfigSourceError,
  resourceName,
} from "./stages.ts";

export interface CloudflareStackInput {
  readonly config: InfraStageConfig;
  readonly database: NeonPostgresResources;
  readonly hyperdrive: Cloudflare.Hyperdrive;
}

const alchemyLocalProxyPort = 1337;

export function makeAlchemyLocalWorkerOrigin(
  worker: "agent" | "api" | "app" | "mcp" | "sync"
) {
  return `http://${worker}.localhost:${alchemyLocalProxyPort}`;
}

export function makeCloudflareWorkerOrigin(input: {
  readonly domains: readonly {
    readonly hostname: string;
    readonly id?: string;
    readonly zoneId?: string;
  }[];
  readonly fallbackHostname: string;
  readonly localDev?: boolean;
  readonly localUrl?: string | undefined;
}) {
  if (input.localDev === true && input.localUrl !== undefined) {
    return input.localUrl;
  }

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

const durableObjectLocationHintByNeonRegion = {
  "aws-ap-southeast-1": "apac",
  "aws-ap-southeast-2": "apac",
  "aws-eu-central-1": "weur",
  "aws-eu-west-2": "weur",
  "aws-sa-east-1": "sam",
  "aws-us-east-1": "enam",
  "aws-us-east-2": "enam",
  "aws-us-west-2": "wnam",
  "azure-eastus2": "enam",
  "azure-gwc": "weur",
  "azure-westus3": "wnam",
} satisfies Record<InfraStageConfig["neonRegion"], DurableObjectLocationHint>;

export function makeDurableObjectLocationHintForNeonRegion(
  neonRegion: InfraStageConfig["neonRegion"]
): DurableObjectLocationHint {
  return durableObjectLocationHintByNeonRegion[neonRegion];
}

export function makeTenantReservedHostBypassRoutePatterns(
  config: Pick<
    InfraStageConfig,
    "tenantReservedHostnames" | "tenantRoutePattern"
  >
) {
  if (config.tenantRoutePattern === undefined) {
    return [];
  }

  return config.tenantReservedHostnames.map((hostname) => `${hostname}/*`);
}

export function shouldReconcileTenantRouting(input: {
  readonly localDev: boolean;
  readonly tenantRoutePattern: string | undefined;
}) {
  return !input.localDev && input.tenantRoutePattern !== undefined;
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
  yield* Effect.annotateCurrentSpan("syncHostname", input.config.syncHostname);
  yield* Effect.annotateCurrentSpan(
    "hyperdriveId",
    input.hyperdrive.hyperdriveId
  );

  const { accountId: cloudflareAccountId } =
    yield* Cloudflare.CloudflareEnvironment;
  const alchemyContext = yield* Alchemy.AlchemyContext;
  const localDev = alchemyContext.dev;
  const betterAuthSecret = yield* Alchemy.Random("BetterAuthSecret", {
    bytes: 32,
  });
  const agentInternalSecret = yield* Alchemy.Random("AgentInternalSecret", {
    bytes: 32,
  });
  const electricSourceSecret = yield* Alchemy.Random("ElectricSourceSecret", {
    bytes: 32,
  });
  const electricSourceSecretValue = electricSourceSecret.text.pipe(
    Output.map(Redacted.value)
  );
  const electricStorageBucketName = resourceName(
    input.config,
    "electric-storage"
  );
  const electricStorageProvisioned = yield* shouldProvisionElectricStorage({
    config: input.config,
    localDev,
  });
  const electricStorageBucket =
    electricStorageProvisioned === true
      ? yield* Cloudflare.R2Bucket("ElectricStorageBucket", {
          name: electricStorageBucketName,
          jurisdiction: "default",
          lifecycleRules: [
            {
              id: "abort-incomplete-multipart-uploads",
              abortMultipartUploadsTransition: {
                condition: {
                  maxAge: 604_800,
                  type: "Age",
                },
              },
            },
          ],
        })
      : undefined;
  let electricStorageCredentials:
    | Pick<ElectricContainerStorageConfig, "accessKeyId" | "secretAccessKey">
    | undefined;

  if (electricStorageProvisioned && localDev) {
    electricStorageCredentials = yield* makeLocalElectricStorageCredentials({
      accountId: cloudflareAccountId,
      bucketName: electricStorageBucketName,
      config: input.config,
    });
  } else if (electricStorageProvisioned) {
    electricStorageCredentials =
      yield* readConfiguredElectricStorageCredentials(input.config);
  }
  const localOrigins = {
    agent: makeAlchemyLocalWorkerOrigin("agent"),
    api: makeAlchemyLocalWorkerOrigin("api"),
    app: makeAlchemyLocalWorkerOrigin("app"),
    mcp: makeAlchemyLocalWorkerOrigin("mcp"),
    sync: makeAlchemyLocalWorkerOrigin("sync"),
  };
  const localDatabaseUrl =
    localDev === true
      ? input.database.branch.connectionUri.pipe(
          Output.map((connectionUri) => Redacted.make(connectionUri))
        )
      : undefined;

  yield* Effect.annotateCurrentSpan("alchemy.localDev", localDev);
  yield* Effect.annotateCurrentSpan(
    "electricStorageProvisioned",
    electricStorageProvisioned
  );

  const authEmailDeadLetterQueue = yield* Cloudflare.Queue(
    "AuthEmailDeadLetterQueue",
    {
      name: resourceName(input.config, "auth-email-dlq"),
    }
  );

  const authEmailQueue = yield* Cloudflare.Queue("AuthEmailQueue", {
    name: resourceName(input.config, "auth-email"),
  });

  const workerAnalytics = yield* Cloudflare.AnalyticsEngineDataset(
    "WorkerAnalytics",
    {
      dataset: resourceName(input.config, "worker-analytics"),
    }
  );

  const domain = yield* makeDomainWorker({
    agentInternalSecret: agentInternalSecret.text,
    analytics: workerAnalytics,
    authEmailQueue,
    betterAuthSecret: betterAuthSecret.text,
    config: input.config,
    databaseUrl: localDatabaseUrl,
    hyperdrive: input.hyperdrive,
    localDev,
    localOrigins,
    name: resourceName(input.config, "domain"),
  });

  const api = yield* makeApiWorker({
    analytics: workerAnalytics,
    config: input.config,
    domain,
    hostname: input.config.apiHostname,
    name: resourceName(input.config, "api"),
  });

  if (!localDev) {
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
  }
  yield* Effect.annotateCurrentSpan(
    "authEmailQueueConsumerReconciled",
    !localDev
  );

  const apiOrigin = Output.all(api.domains, api.url).pipe(
    Output.map(([domains, localUrl]) =>
      makeCloudflareWorkerOrigin({
        domains,
        fallbackHostname: input.config.apiHostname,
        localDev,
        localUrl,
      })
    )
  );

  const mcp = yield* makeMcpWorker({
    analytics: workerAnalytics,
    config: input.config,
    domain,
    hostname: input.config.mcpHostname,
    name: resourceName(input.config, "mcp"),
  });

  const mcpOrigin = Output.all(mcp.domains, mcp.url).pipe(
    Output.map(([domains, localUrl]) =>
      makeCloudflareWorkerOrigin({
        domains,
        fallbackHostname: input.config.mcpHostname,
        localDev,
        localUrl,
      })
    )
  );

  const agentAiGatewayProps = makeAgentAiGatewayProps({
    config: input.config,
  });
  const agentAiGateway = yield* Cloudflare.AiGateway(
    "AgentAiGateway",
    agentAiGatewayProps
  );
  yield* Effect.annotateCurrentSpan("agentAiGatewayId", agentAiGatewayProps.id);

  const agent = yield* makeAgentWorker({
    agentInternalSecret: agentInternalSecret.text,
    aiGateway: agentAiGateway,
    analytics: workerAnalytics,
    config: input.config,
    domain,
    hostname: input.config.agentHostname,
    localDev,
    localAppOrigin: localOrigins.app,
    name: resourceName(input.config, "agent"),
  });

  const agentOrigin = Output.all(agent.domains, agent.url).pipe(
    Output.map(([domains, localUrl]) =>
      makeCloudflareWorkerOrigin({
        domains,
        fallbackHostname: input.config.agentHostname,
        localDev,
        localUrl,
      })
    )
  );

  const sync = yield* makeSyncWorker({
    analytics: workerAnalytics,
    config: input.config,
    database: input.database,
    domain,
    electricContainerName: resourceName(input.config, "electric"),
    electricSqlLocationHint: makeDurableObjectLocationHintForNeonRegion(
      input.config.neonRegion
    ),
    electricSourceSecret: electricSourceSecret.text,
    electricSourceSecretValue,
    hostname: input.config.syncHostname,
    localDev,
    localAppOrigin: localOrigins.app,
    name: resourceName(input.config, "sync"),
    storage:
      electricStorageCredentials === undefined
        ? undefined
        : {
            accessKeyId: electricStorageCredentials.accessKeyId,
            accountId: cloudflareAccountId,
            bucketName: electricStorageBucketName,
            secretAccessKey: electricStorageCredentials.secretAccessKey,
          },
  });

  const syncOrigin = Output.all(sync.domains, sync.url).pipe(
    Output.map(([domains, localUrl]) =>
      makeCloudflareWorkerOrigin({
        domains,
        fallbackHostname: input.config.syncHostname,
        localDev,
        localUrl,
      })
    )
  );

  const app = yield* makeAppWorker({
    agentOrigin,
    apiOrigin,
    config: input.config,
    hostname: input.config.appHostname,
    localDev,
    localAppOrigin: localOrigins.app,
    name: resourceName(input.config, "app"),
    syncOrigin,
  });

  const appOrigin = Output.all(app.domains, app.url).pipe(
    Output.map(([domains, localUrl]) =>
      makeCloudflareWorkerOrigin({
        domains,
        fallbackHostname: input.config.appHostname,
        localDev,
        localUrl,
      })
    )
  );

  const reconcileTenantRouting = shouldReconcileTenantRouting({
    localDev,
    tenantRoutePattern: input.config.tenantRoutePattern,
  });
  const tenantRoutePattern = reconcileTenantRouting
    ? input.config.tenantRoutePattern
    : undefined;
  yield* Effect.annotateCurrentSpan(
    "tenantRoutingReconciled",
    reconcileTenantRouting
  );
  const tenantWildcardDnsRecord =
    tenantRoutePattern === undefined
      ? undefined
      : yield* TenantWildcardDnsRecord("TenantWildcardDnsRecord", {
          zoneName: input.config.zoneName,
        });
  const tenantRoute =
    tenantRoutePattern === undefined
      ? undefined
      : yield* TenantWorkerRoute("TenantWorkerRoute", {
          pattern: tenantRoutePattern,
          scriptName: app.workerName,
          zoneName: input.config.zoneName,
        });
  const tenantReservedHostBypassRoutes =
    tenantRoutePattern === undefined
      ? []
      : // oxlint-disable-next-line unicorn/no-array-for-each -- Effect.forEach keeps route reconciliation inside the stack Effect.
        yield* Effect.forEach(
          makeTenantReservedHostBypassRoutePatterns(input.config),
          (pattern, index) =>
            TenantWorkerRoute(`TenantReservedHostBypassRoute${index}`, {
              pattern,
              scriptName: undefined,
              zoneName: input.config.zoneName,
            })
        );

  return {
    api,
    apiOrigin,
    agent,
    agentAiGateway,
    agentOrigin,
    app,
    appOrigin,
    authEmailDeadLetterQueue,
    authEmailQueue,
    database: input.hyperdrive,
    domain,
    electricStorageBucket,
    mcp,
    mcpOrigin,
    sync,
    syncOrigin,
    tenantReservedHostBypassRoutePatterns: Array.map((route) => route.pattern)(
      tenantReservedHostBypassRoutes
    ),
    tenantRoutePattern: tenantRoute?.pattern,
    tenantWildcardDnsRecordId: tenantWildcardDnsRecord?.recordId,
    workerAnalyticsDataset: workerAnalytics.dataset,
  } as const;
});

function makeLocalElectricStorageCredentials(input: {
  readonly accountId: string;
  readonly bucketName: string;
  readonly config: InfraStageConfig;
}) {
  return Effect.gen(function* () {
    const token = yield* Cloudflare.AccountApiToken("ElectricStorageR2Token", {
      name: resourceName(input.config, "electric-storage-r2-token"),
      accountId: input.accountId,
      policies: [
        {
          effect: "allow",
          permissionGroups: [
            "Workers R2 Storage Bucket Item Read",
            "Workers R2 Storage Bucket Item Write",
          ],
          resources: {
            [makeCloudflareR2BucketResourceKey({
              accountId: input.accountId,
              bucketName: input.bucketName,
              jurisdiction: "default",
            })]: "*",
          },
        },
      ],
    });

    return {
      accessKeyId: token.tokenId,
      secretAccessKey: token.value.pipe(Output.map(makeR2SecretAccessKey)),
    } satisfies Pick<
      ElectricContainerStorageConfig,
      "accessKeyId" | "secretAccessKey"
    >;
  });
}

export function shouldProvisionElectricStorage(input: {
  readonly config: Pick<
    InfraStageConfig,
    | "appName"
    | "electricStorageAccessKeyId"
    | "electricStorageSecretAccessKey"
    | "stage"
  >;
  readonly localDev: boolean;
}) {
  if (input.localDev) {
    return Effect.succeed(true);
  }

  const identity = makeAlchemyStageIdentity({
    appName: input.config.appName,
    stage: input.config.stage,
  });

  if (identity.isPullRequestPreview || identity.isEphemeralCi) {
    return Effect.succeed(false);
  }

  const hasAccessKey = input.config.electricStorageAccessKeyId !== undefined;
  const hasSecretKey =
    input.config.electricStorageSecretAccessKey !== undefined;

  if (hasAccessKey && hasSecretKey) {
    return Effect.succeed(true);
  }

  if (hasAccessKey !== hasSecretKey) {
    return Effect.fail(
      makeInfraConfigSourceError(
        "CEIRD_ELECTRIC_STORAGE_ACCESS_KEY_ID and CEIRD_ELECTRIC_STORAGE_SECRET_ACCESS_KEY must be configured together"
      )
    );
  }

  return Effect.fail(
    makeInfraConfigSourceError(
      "CEIRD_ELECTRIC_STORAGE_ACCESS_KEY_ID and CEIRD_ELECTRIC_STORAGE_SECRET_ACCESS_KEY are required outside local Alchemy dev"
    )
  );
}

function readConfiguredElectricStorageCredentials(
  config: InfraStageConfig
): Effect.Effect<
  Pick<ElectricContainerStorageConfig, "accessKeyId" | "secretAccessKey">,
  Config.ConfigError
> {
  if (
    config.electricStorageAccessKeyId === undefined ||
    config.electricStorageSecretAccessKey === undefined
  ) {
    return Effect.fail(
      makeInfraConfigSourceError(
        "CEIRD_ELECTRIC_STORAGE_ACCESS_KEY_ID and CEIRD_ELECTRIC_STORAGE_SECRET_ACCESS_KEY are required outside local Alchemy dev"
      )
    );
  }

  return Effect.succeed({
    accessKeyId: Redacted.value(config.electricStorageAccessKeyId),
    secretAccessKey: Redacted.value(config.electricStorageSecretAccessKey),
  });
}
