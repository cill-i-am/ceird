/// <reference types="@cloudflare/workers-types" />

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import type { Input, InputProps } from "alchemy/Input";
import * as Output from "alchemy/Output";
import * as Array from "effect/Array";
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
import {
  makeElectricContainerEnv,
  makeSyncWorker,
} from "../apps/sync/infra/cloudflare-worker.ts";
import type { ElectricContainerConfig } from "../apps/sync/infra/cloudflare-worker.ts";
import { readCloudflareAccountId } from "./cloudflare-environment.ts";
import {
  makeElectricStorageR2TokenPolicy,
  makeR2SecretAccessKey,
} from "./cloudflare-r2.ts";
import {
  TenantWildcardDnsRecord,
  TenantWorkerRoute,
} from "./cloudflare-tenant-routing.ts";
import type { NeonPostgresResources } from "./neon.ts";
import type { InfraStageConfig } from "./stages.ts";
import { makeAlchemyStageIdentity, resourceName } from "./stages.ts";

export interface CloudflareStackInput {
  readonly config: InfraStageConfig;
  readonly database: NeonPostgresResources;
  readonly hyperdrive: Cloudflare.Hyperdrive;
}

type LocalWorkerName = "agent" | "api" | "app" | "mcp" | "sync";
type LocalWorkerOrigins = Record<LocalWorkerName, string>;

const localWorkerOriginEnvKeys = {
  agent: "CEIRD_LOCAL_AGENT_ORIGIN",
  api: "CEIRD_LOCAL_API_ORIGIN",
  app: "CEIRD_LOCAL_APP_ORIGIN",
  mcp: "CEIRD_LOCAL_MCP_ORIGIN",
  sync: "CEIRD_LOCAL_SYNC_ORIGIN",
} as const satisfies Record<LocalWorkerName, string>;

const portlessLocalBaseName = "ceird";
const portlessLocalTld = "localhost";

export function makePortlessLocalServiceName(input: {
  readonly stage: string;
  readonly worker: LocalWorkerName;
}) {
  const identity = makeAlchemyStageIdentity({ stage: input.stage });
  return `${input.worker}.${identity.stageSlug}.${portlessLocalBaseName}`;
}

export function makePortlessLocalWorkerOrigin(input: {
  readonly stage: string;
  readonly worker: LocalWorkerName;
}) {
  return `https://${makePortlessLocalServiceName(input)}.${portlessLocalTld}`;
}

function readLocalWorkerOriginOverride(
  env: Record<string, string | undefined>,
  key: string
) {
  const value = env[key];

  if (value === undefined || value.length === 0) {
    return;
  }

  if (!URL.canParse(value)) {
    throw new Error(`${key} must be an absolute HTTP(S) origin.`);
  }

  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${key} must use http or https.`);
  }

  return url.origin;
}

export function makeLocalWorkerOrigins(input: {
  readonly env?: Record<string, string | undefined>;
  readonly stage: string;
}): LocalWorkerOrigins {
  const env = input.env ?? process.env;

  return {
    agent:
      readLocalWorkerOriginOverride(env, localWorkerOriginEnvKeys.agent) ??
      makePortlessLocalWorkerOrigin({ stage: input.stage, worker: "agent" }),
    api:
      readLocalWorkerOriginOverride(env, localWorkerOriginEnvKeys.api) ??
      makePortlessLocalWorkerOrigin({ stage: input.stage, worker: "api" }),
    app:
      readLocalWorkerOriginOverride(env, localWorkerOriginEnvKeys.app) ??
      makePortlessLocalWorkerOrigin({ stage: input.stage, worker: "app" }),
    mcp:
      readLocalWorkerOriginOverride(env, localWorkerOriginEnvKeys.mcp) ??
      makePortlessLocalWorkerOrigin({ stage: input.stage, worker: "mcp" }),
    sync:
      readLocalWorkerOriginOverride(env, localWorkerOriginEnvKeys.sync) ??
      makePortlessLocalWorkerOrigin({ stage: input.stage, worker: "sync" }),
  };
}

export function makeCloudflareWorkerOrigin(input: {
  readonly domains: readonly (
    | string
    | {
        readonly hostname: string;
        readonly id?: string;
        readonly zoneId?: string;
      }
  )[];
  readonly fallbackHostname: string;
  readonly localDev?: boolean;
  readonly localUrl?: string | undefined;
}) {
  if (input.localDev === true && input.localUrl !== undefined) {
    return input.localUrl;
  }

  const [domain] = input.domains;
  const origin =
    typeof domain === "string" ? readOptionalUrlOrigin(domain) : undefined;
  const hostname = typeof domain === "string" ? domain : domain?.hostname;

  return origin ?? `https://${hostname ?? input.fallbackHostname}`;
}

function readOptionalUrlOrigin(value: string) {
  if (URL.canParse(value)) {
    return new URL(value).origin;
  }
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

  const cloudflareAccountId = yield* readCloudflareAccountId();
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
  let electricStorageCredentials: ElectricStorageCredentialValues | undefined;

  if (electricStorageProvisioned) {
    electricStorageCredentials = yield* makeElectricStorageCredentials({
      accountId: cloudflareAccountId,
      bucketName: electricStorageBucketName,
      config: input.config,
    });
  }
  const localOrigins = makeLocalWorkerOrigins({
    stage: input.config.stage,
  });
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
    betterAuthSecrets: input.config.authSecrets,
    config: input.config,
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
    localDev,
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
    localDev,
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

  const electricContainerProvisioning = {
    electricStorageCredentials,
    localDev,
  };
  const electricContainer =
    shouldProvisionElectricContainer(electricContainerProvisioning) === false
      ? undefined
      : yield* makeElectricContainerConfig({
          accountId: cloudflareAccountId,
          bucketName: electricStorageBucketName,
          databaseConnectionUri: input.database.branch.connectionUri,
          electricSourceSecret: electricSourceSecret.text,
          name: resourceName(input.config, "electric"),
          storageCredentials:
            electricContainerProvisioning.electricStorageCredentials,
        });
  yield* Effect.annotateCurrentSpan(
    "electricContainerProvisioned",
    electricContainer !== undefined
  );

  const sync = yield* makeSyncWorker({
    analytics: workerAnalytics,
    config: input.config,
    domain,
    electricContainer,
    electricSqlLocationHint: makeDurableObjectLocationHintForNeonRegion(
      input.config.neonRegion
    ),
    electricSourceSecret: electricSourceSecret.text,
    hostname: input.config.syncHostname,
    localDev,
    localAppOrigin: localOrigins.app,
    name: resourceName(input.config, "sync"),
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
    agentOrigin: localDev ? localOrigins.agent : agentOrigin,
    apiOrigin: localDev ? localOrigins.api : apiOrigin,
    config: input.config,
    hostname: input.config.appHostname,
    localDev,
    localAppOrigin: localOrigins.app,
    name: resourceName(input.config, "app"),
    syncOrigin: localDev ? localOrigins.sync : syncOrigin,
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

export interface ElectricStorageCredentialValues {
  readonly accessKeyId: SecretStringInput;
  readonly secretAccessKey: SecretStringInput;
}

type SecretString = string | Redacted.Redacted<string>;
type SecretStringInput = SecretString | Output.Output<SecretString>;
interface RedactedMarker {
  readonly _tag: "Redacted";
  readonly value: string;
}

function isRedactedMarker(value: unknown): value is RedactedMarker {
  return (
    typeof value === "object" &&
    value !== null &&
    "_tag" in value &&
    value._tag === "Redacted" &&
    "value" in value &&
    typeof value.value === "string"
  );
}

function toRedactedSecretString(value: SecretString) {
  return Redacted.isRedacted(value) ? value : Redacted.make(value);
}

export function redactInput(value: SecretString): Redacted.Redacted<string>;
export function redactInput<Req>(
  value: Output.Output<SecretString, Req>
): Output.Output<Redacted.Redacted<string>, Req>;
export function redactInput(
  value: SecretStringInput
): Input<Redacted.Redacted<string>>;
export function redactInput(
  value: SecretStringInput
): Input<Redacted.Redacted<string>> {
  if (Output.isOutput(value)) {
    return value.pipe(
      Output.map((resolvedValue) =>
        isRedactedMarker(resolvedValue)
          ? Redacted.make(resolvedValue.value)
          : toRedactedSecretString(resolvedValue)
      )
    );
  }

  return toRedactedSecretString(value);
}

function makeElectricContainerConfig(input: {
  readonly accountId: string;
  readonly bucketName: string;
  readonly databaseConnectionUri: SecretStringInput;
  readonly electricSourceSecret: Input<Redacted.Redacted<string>>;
  readonly name: string;
  readonly storageCredentials: ElectricStorageCredentialValues;
}): Effect.Effect<ElectricContainerConfig, never, Cloudflare.Providers> {
  return Effect.gen(function* () {
    // Preserve the previously declared account store so Alchemy state reads keep working after deploy.
    yield* Cloudflare.SecretsStore("ElectricContainerSecrets");

    return {
      env: makeElectricContainerEnv({
        databaseUrl: redactInput(input.databaseConnectionUri),
        electricSecret: input.electricSourceSecret,
        storage: {
          accessKeyId: redactInput(input.storageCredentials.accessKeyId),
          accountId: input.accountId,
          bucketName: input.bucketName,
          awsSecretAccessKey: redactInput(
            input.storageCredentials.secretAccessKey
          ),
        },
      }),
      name: input.name,
    } satisfies ElectricContainerConfig;
  });
}

function makeElectricStorageCredentials(input: {
  readonly accountId: string;
  readonly bucketName: string;
  readonly config: InfraStageConfig;
}) {
  return Effect.gen(function* () {
    const token = yield* Cloudflare.AccountApiToken("ElectricStorageR2Token", {
      name: resourceName(input.config, "electric-storage-r2-token"),
      accountId: input.accountId,
      policies: [
        makeElectricStorageR2TokenPolicy({
          accountId: input.accountId,
          bucketName: input.bucketName,
          jurisdiction: "default",
        }),
      ],
    });

    return {
      accessKeyId: token.tokenId,
      secretAccessKey: token.value.pipe(Output.map(makeR2SecretAccessKey)),
    } satisfies ElectricStorageCredentialValues;
  });
}

export function shouldProvisionElectricStorage(input: {
  readonly config: Pick<
    InfraStageConfig,
    "appName" | "neonParentStage" | "stage"
  >;
  readonly localDev: boolean;
}) {
  void input;
  return Effect.succeed(true);
}

export function shouldProvisionElectricContainer(input: {
  readonly electricStorageCredentials:
    | ElectricStorageCredentialValues
    | undefined;
  readonly localDev: boolean;
}): input is {
  readonly electricStorageCredentials: ElectricStorageCredentialValues;
  readonly localDev: false;
} {
  return (
    input.localDev === false && input.electricStorageCredentials !== undefined
  );
}
