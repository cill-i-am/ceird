/// <reference types="@cloudflare/workers-types" />

import * as Cloudflare from "alchemy/Cloudflare";
import type {
  ContainerApplicationProps,
  WorkerProps,
} from "alchemy/Cloudflare";
import type { Input, InputProps } from "alchemy/Input";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";

import {
  ceirdWorkerCompatibility,
  ceirdWorkerObservability,
} from "../../../infra/cloudflare-worker-defaults.ts";
import type { NeonPostgresResources } from "../../../infra/neon.ts";
import type { DomainWorkerResource } from "../../domain/infra/cloudflare-worker.ts";

const syncWorkerMain = new URL("../src/worker.ts", import.meta.url).pathname;
const electricContainerMain = new URL(
  "../src/platform/cloudflare/electric-container-runtime.ts",
  import.meta.url
).pathname;
const syncWorkerObservability = {
  ...ceirdWorkerObservability,
  logs: {
    ...ceirdWorkerObservability.logs,
    invocationLogs: false,
  },
} satisfies WorkerProps["observability"];

export type WorkerServiceBinding = Service;

// oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- Cloudflare.Worker needs an exact keyed object type for service bindings.
export type SyncWorkerBindings = {
  readonly ANALYTICS: Cloudflare.AnalyticsEngineDataset;
  readonly DOMAIN: DomainWorkerResource;
  readonly ElectricSql: Cloudflare.DurableObjectNamespaceLike;
};

export interface SyncWorkerBindingEnv {
  readonly ANALYTICS: AnalyticsEngineDataset;
  readonly DOMAIN: WorkerServiceBinding;
  readonly ElectricSql: DurableObjectNamespace;
}

type SyncWorkerBindingProps = {
  readonly [BindingName in keyof SyncWorkerBindings]:
    | SyncWorkerBindings[BindingName]
    | Effect.Effect<SyncWorkerBindings[BindingName], never, never>;
};

type WorkerConfiguredEnvValue = Input<NonNullable<WorkerProps["env"]>[string]>;
type WorkerConfiguredEnv = Record<string, WorkerConfiguredEnvValue>;

export interface SyncWorkerStageConfig {
  readonly appHostname: string;
  readonly electricContainerInstanceType: Cloudflare.ContainerApplication.InstanceType;
  readonly tenantTrustedOriginPattern?: string | undefined;
  readonly workerAnalyticsSampleRate: number;
}

export interface SyncWorkerConfiguredEnv {
  readonly AUTH_APP_ORIGIN: string;
  readonly AUTH_TRUSTED_ORIGINS: string;
  readonly CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: string;
  readonly ELECTRIC_SQL_LOCATION_HINT: DurableObjectLocationHint;
  readonly ELECTRIC_SOURCE_SECRET: Input<Redacted.Redacted<string>>;
  readonly NODE_ENV: "production";
}

export interface ElectricContainerConfiguredEnv {
  readonly CEIRD_ELECTRIC_STORAGE_BACKEND: "r2";
  readonly CEIRD_ELECTRIC_STORAGE_MOUNT: "/var/lib/electric";
  readonly ELECTRIC_INSECURE: "false";
  readonly ELECTRIC_LOG_LEVEL: "info";
  readonly ELECTRIC_PERSISTENT_STATE: "file";
  readonly ELECTRIC_PORT: "3000";
  readonly ELECTRIC_SHAPE_DB_EXCLUSIVE_MODE: "true";
  readonly ELECTRIC_STORAGE: "fast_file";
  readonly ELECTRIC_STORAGE_DIR: "/var/lib/electric";
  readonly R2_ACCOUNT_ID: Input<string>;
  readonly R2_BUCKET_NAME: Input<string>;
}

export interface ElectricContainerStorageConfig {
  readonly accessKeyId: Input<string>;
  readonly accountId: Input<string>;
  readonly bucketName: Input<string>;
  readonly secretAccessKey: Input<string>;
}

export function makeSyncWorkerBindings(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly domain: DomainWorkerResource;
}) {
  return {
    ANALYTICS: input.analytics,
    DOMAIN: input.domain,
    ElectricSql: Cloudflare.DurableObjectNamespace("ElectricSql", {
      className: "ElectricSql",
    }),
  } satisfies SyncWorkerBindingProps;
}

export function makeSyncWorkerEnv(input: {
  readonly config: SyncWorkerStageConfig;
  readonly electricSqlLocationHint: DurableObjectLocationHint;
  readonly electricSourceSecret: Input<Redacted.Redacted<string>>;
  readonly localDev?: boolean | undefined;
  readonly localAppOrigin?: string | undefined;
}): SyncWorkerConfiguredEnv {
  const authAppOrigin =
    input.localDev === true && input.localAppOrigin
      ? input.localAppOrigin
      : `https://${input.config.appHostname}`;
  const authTrustedOrigins = [
    authAppOrigin,
    input.localDev === true
      ? undefined
      : input.config.tenantTrustedOriginPattern,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(",");

  return {
    AUTH_APP_ORIGIN: authAppOrigin,
    AUTH_TRUSTED_ORIGINS: authTrustedOrigins,
    CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: String(
      input.config.workerAnalyticsSampleRate
    ),
    ELECTRIC_SQL_LOCATION_HINT: input.electricSqlLocationHint,
    ELECTRIC_SOURCE_SECRET: input.electricSourceSecret,
    NODE_ENV: "production",
  } satisfies SyncWorkerConfiguredEnv & WorkerConfiguredEnv;
}

export function makeElectricContainerEnv(input: {
  readonly storage: Pick<
    ElectricContainerStorageConfig,
    "accountId" | "bucketName"
  >;
}): ElectricContainerConfiguredEnv {
  return {
    CEIRD_ELECTRIC_STORAGE_BACKEND: "r2",
    CEIRD_ELECTRIC_STORAGE_MOUNT: "/var/lib/electric",
    ELECTRIC_INSECURE: "false",
    ELECTRIC_LOG_LEVEL: "info",
    ELECTRIC_PERSISTENT_STATE: "file",
    ELECTRIC_PORT: "3000",
    ELECTRIC_SHAPE_DB_EXCLUSIVE_MODE: "true",
    ELECTRIC_STORAGE: "fast_file",
    ELECTRIC_STORAGE_DIR: "/var/lib/electric",
    R2_ACCOUNT_ID: input.storage.accountId,
    R2_BUCKET_NAME: input.storage.bucketName,
  };
}

function shellEnv(name: string) {
  return `$${"{"}${name}${"}"}`;
}

const tigrisfsVersionEnv = shellEnv("TIGRISFS_VERSION");

export const electricContainerDockerfile = [
  "FROM --platform=linux/amd64 golang:1.25-bookworm AS tigrisfs-build",
  "",
  "ARG TIGRISFS_VERSION=1.2.1",
  `RUN git clone --depth=1 --branch v${tigrisfsVersionEnv} https://github.com/tigrisdata/tigrisfs.git /tmp/tigrisfs \\`,
  "  && cd /tmp/tigrisfs \\",
  "  && GOBIN=/out /usr/local/go/bin/go install . \\",
  "  && rm -rf /tmp/tigrisfs",
  "",
  "FROM --platform=linux/amd64 electricsql/electric:subqueries-beta-7",
  "",
  "USER root",
  "COPY --from=tigrisfs-build /out/tigrisfs /usr/local/bin/tigrisfs",
  "RUN apt-get update \\",
  "  && apt-get install -y --no-install-recommends ca-certificates fuse3 nodejs \\",
  "  && chmod +x /usr/local/bin/tigrisfs \\",
  "  && mkdir -p /var/lib/electric \\",
  "  && rm -rf /var/lib/apt/lists/* \\",
  "  && chown -R 65532:65532 /app /var/lib/electric",
  "USER 65532:65532",
].join("\n");

export function makeElectricContainerProps(input: {
  readonly config: SyncWorkerStageConfig;
  readonly databaseConnectionUri: Input<string>;
  readonly electricSourceSecret: Input<string>;
  readonly name: string;
  readonly storage: ElectricContainerStorageConfig;
}) {
  return {
    isExternal: true,
    name: input.name,
    main: electricContainerMain,
    runtime: "node",
    dockerfile: electricContainerDockerfile,
    autoInstallExternals: false,
    instances: 1,
    maxInstances: 1,
    instanceType: input.config.electricContainerInstanceType,
    observability: {
      logs: {
        enabled: true,
      },
    },
    ports: [{ name: "http", port: 3000 }],
    checks: [
      {
        interval: "30s",
        kind: "ready",
        name: "electric-tcp",
        port: "3000",
        retries: 3,
        timeout: "5s",
        type: "tcp",
      },
    ],
    environmentVariables: Object.entries(
      makeElectricContainerEnv({
        storage: input.storage,
      })
    ).map(([name, value]) => ({
      name,
      value,
    })),
    secrets: [
      {
        name: "AWS_ACCESS_KEY_ID",
        secret: input.storage.accessKeyId,
        type: "env",
      },
      {
        name: "AWS_SECRET_ACCESS_KEY",
        secret: input.storage.secretAccessKey,
        type: "env",
      },
      {
        name: "DATABASE_URL",
        secret: input.databaseConnectionUri,
        type: "env",
      },
      {
        name: "ELECTRIC_SECRET",
        secret: input.electricSourceSecret,
        type: "env",
      },
    ],
  } satisfies InputProps<ContainerApplicationProps>;
}

export function makeSyncWorkerProps(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly config: SyncWorkerStageConfig;
  readonly domain: DomainWorkerResource;
  readonly electricSqlLocationHint: DurableObjectLocationHint;
  readonly electricSourceSecret: Input<Redacted.Redacted<string>>;
  readonly hostname: string;
  readonly localDev?: boolean | undefined;
  readonly localAppOrigin?: string | undefined;
  readonly name: string;
}) {
  return {
    name: input.name,
    main: syncWorkerMain,
    compatibility: ceirdWorkerCompatibility,
    bindings: makeSyncWorkerBindings({
      analytics: input.analytics,
      domain: input.domain,
    }),
    env: {
      ...makeSyncWorkerEnv({
        config: input.config,
        electricSqlLocationHint: input.electricSqlLocationHint,
        electricSourceSecret: input.electricSourceSecret,
        localDev: input.localDev,
        localAppOrigin: input.localAppOrigin,
      }),
    },
    domain: input.hostname,
    observability: syncWorkerObservability,
    url: false,
  } satisfies InputProps<WorkerProps<SyncWorkerBindingProps>>;
}

export function makeSyncWorker(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly config: SyncWorkerStageConfig;
  readonly database: NeonPostgresResources;
  readonly domain: DomainWorkerResource;
  readonly electricContainerName: string;
  readonly electricSqlLocationHint: DurableObjectLocationHint;
  readonly electricSourceSecret: Input<Redacted.Redacted<string>>;
  readonly electricSourceSecretValue: Input<string>;
  readonly hostname: string;
  readonly localDev?: boolean | undefined;
  readonly localAppOrigin?: string | undefined;
  readonly name: string;
  readonly storage?: ElectricContainerStorageConfig | undefined;
}) {
  return Effect.gen(function* () {
    const worker = yield* Cloudflare.Worker("Sync", makeSyncWorkerProps(input));

    if (input.storage !== undefined) {
      const electricContainer = yield* Cloudflare.Container<unknown>()(
        "ElectricSql",
        makeElectricContainerProps({
          config: input.config,
          databaseConnectionUri: input.database.branch.connectionUri,
          electricSourceSecret: input.electricSourceSecretValue,
          name: input.electricContainerName,
          storage: input.storage,
        })
      );

      yield* electricContainer.bind`ElectricSql`({
        durableObjects: {
          namespaceId: worker.durableObjectNamespaces.pipe(
            Output.map((namespaces) => namespaces.ElectricSql)
          ),
        },
      });
      yield* worker.bind`ElectricSqlContainer`({
        containers: [{ className: "ElectricSql" }],
      });
    }

    return worker;
  });
}
