/// <reference types="@cloudflare/workers-types" />

import type { DomainServiceBinding } from "@ceird/domain-core";
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

export interface SyncWorkerResourceEnv {
  readonly ANALYTICS?: Cloudflare.AnalyticsEngineDataset | undefined;
  readonly DOMAIN: DomainWorkerResource;
  readonly ElectricSql: Cloudflare.DurableObjectNamespaceLike;
}

export interface SyncWorkerBindingEnv {
  readonly ANALYTICS?: AnalyticsEngineDataset | undefined;
  readonly DOMAIN: DomainServiceBinding;
  readonly ElectricSql: DurableObjectNamespace;
}

type WorkerEnvShape<Env extends object> = {
  readonly [Key in keyof Env]: Env[Key];
};
type WorkerEnvInput<Env extends object> = {
  readonly [Key in keyof WorkerEnvShape<Env>]: undefined extends WorkerEnvShape<Env>[Key]
    ? Input<Exclude<WorkerEnvShape<Env>[Key], undefined>> | undefined
    : Input<WorkerEnvShape<Env>[Key]>;
};
type SyncWorkerElectricContainerConfiguredEnv = Required<
  Pick<
    SyncWorkerConfiguredEnv,
    | "ELECTRIC_CONTAINER_AWS_ACCESS_KEY_ID"
    | "ELECTRIC_CONTAINER_AWS_SECRET_ACCESS_KEY"
    | "ELECTRIC_CONTAINER_DATABASE_URL"
    | "ELECTRIC_CONTAINER_ELECTRIC_SECRET"
    | "ELECTRIC_CONTAINER_R2_ACCOUNT_ID"
    | "ELECTRIC_CONTAINER_R2_BUCKET_NAME"
  >
>;

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
  readonly ELECTRIC_CONTAINER_AWS_ACCESS_KEY_ID?: Redacted.Redacted<string>;
  readonly ELECTRIC_CONTAINER_AWS_SECRET_ACCESS_KEY?: Redacted.Redacted<string>;
  readonly ELECTRIC_CONTAINER_DATABASE_URL?: Redacted.Redacted<string>;
  readonly ELECTRIC_CONTAINER_ELECTRIC_SECRET?: Redacted.Redacted<string>;
  readonly ELECTRIC_CONTAINER_R2_ACCOUNT_ID?: string;
  readonly ELECTRIC_CONTAINER_R2_BUCKET_NAME?: string;
  readonly ELECTRIC_SQL_LOCATION_HINT: DurableObjectLocationHint;
  readonly ELECTRIC_SOURCE_SECRET: Redacted.Redacted<string>;
  readonly NODE_ENV: "production";
}

export interface ElectricContainerConfiguredEnv {
  readonly AWS_ACCESS_KEY_ID: Input<Redacted.Redacted<string>>;
  readonly AWS_SECRET_ACCESS_KEY: Input<Redacted.Redacted<string>>;
  readonly CEIRD_ELECTRIC_STORAGE_BACKEND: "r2";
  readonly CEIRD_ELECTRIC_STORAGE_MOUNT: "/var/lib/electric";
  readonly DATABASE_URL: Input<Redacted.Redacted<string>>;
  readonly ELECTRIC_INSECURE: "false";
  readonly ELECTRIC_LOG_LEVEL: "info";
  readonly ELECTRIC_PERSISTENT_STATE: "file";
  readonly ELECTRIC_PORT: "3000";
  readonly ELECTRIC_SECRET: Input<Redacted.Redacted<string>>;
  readonly ELECTRIC_SHAPE_DB_EXCLUSIVE_MODE: "true";
  readonly ELECTRIC_STORAGE: "fast_file";
  readonly ELECTRIC_STORAGE_DIR: "/var/lib/electric";
  readonly R2_ACCOUNT_ID: Input<string>;
  readonly R2_BUCKET_NAME: Input<string>;
}

export interface ElectricContainerStorageConfig {
  readonly accessKeyId: Input<Redacted.Redacted<string>>;
  readonly accountId: Input<string>;
  readonly bucketName: Input<string>;
  readonly awsSecretAccessKey: Input<Redacted.Redacted<string>>;
}

export interface ElectricContainerConfig {
  readonly env: ElectricContainerConfiguredEnv;
  readonly name: string;
}

type SyncWorkerEnv = SyncWorkerResourceEnv & SyncWorkerConfiguredEnv;
type SyncWorkerConfiguredEnvInput = WorkerEnvInput<SyncWorkerConfiguredEnv>;

export function makeSyncWorkerResourceEnv(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly domain: DomainWorkerResource;
  readonly localDev?: boolean | undefined;
}) {
  return {
    ...(input.localDev === true ? {} : { ANALYTICS: input.analytics }),
    DOMAIN: input.domain,
    ElectricSql: Cloudflare.DurableObjectNamespace("ElectricSql", {
      className: "ElectricSql",
    }),
  } satisfies WorkerEnvInput<SyncWorkerResourceEnv>;
}

export function makeSyncWorkerConfiguredEnv(input: {
  readonly config: SyncWorkerStageConfig;
  readonly electricContainer?: ElectricContainerConfig | undefined;
  readonly electricSqlLocationHint: DurableObjectLocationHint;
  readonly electricSourceSecret: Input<Redacted.Redacted<string>>;
  readonly localDev?: boolean | undefined;
  readonly localAppOrigin?: string | undefined;
}) {
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

  const baseEnv = {
    AUTH_APP_ORIGIN: authAppOrigin,
    AUTH_TRUSTED_ORIGINS: authTrustedOrigins,
    CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: String(
      input.config.workerAnalyticsSampleRate
    ),
    ELECTRIC_SQL_LOCATION_HINT: input.electricSqlLocationHint,
    ELECTRIC_SOURCE_SECRET: input.electricSourceSecret,
    NODE_ENV: "production",
  } satisfies SyncWorkerConfiguredEnvInput;
  const electricContainerEnv = makeSyncWorkerElectricContainerEnv(
    input.electricContainer
  );

  if (electricContainerEnv === undefined) {
    return baseEnv;
  }

  return {
    ...baseEnv,
    ...electricContainerEnv,
  } satisfies SyncWorkerConfiguredEnvInput;
}

export function makeElectricContainerEnv(input: {
  readonly databaseUrl: Input<Redacted.Redacted<string>>;
  readonly electricSecret: Input<Redacted.Redacted<string>>;
  readonly storage: ElectricContainerStorageConfig;
}): ElectricContainerConfiguredEnv {
  return {
    AWS_ACCESS_KEY_ID: input.storage.accessKeyId,
    AWS_SECRET_ACCESS_KEY: input.storage.awsSecretAccessKey,
    CEIRD_ELECTRIC_STORAGE_BACKEND: "r2",
    CEIRD_ELECTRIC_STORAGE_MOUNT: "/var/lib/electric",
    DATABASE_URL: input.databaseUrl,
    ELECTRIC_INSECURE: "false",
    ELECTRIC_LOG_LEVEL: "info",
    ELECTRIC_PERSISTENT_STATE: "file",
    ELECTRIC_PORT: "3000",
    ELECTRIC_SECRET: input.electricSecret,
    ELECTRIC_SHAPE_DB_EXCLUSIVE_MODE: "true",
    ELECTRIC_STORAGE: "fast_file",
    ELECTRIC_STORAGE_DIR: "/var/lib/electric",
    R2_ACCOUNT_ID: input.storage.accountId,
    R2_BUCKET_NAME: input.storage.bucketName,
  };
}

function makeSyncWorkerElectricContainerEnv(
  electricContainer: ElectricContainerConfig | undefined
): WorkerEnvInput<SyncWorkerElectricContainerConfiguredEnv> | undefined {
  if (electricContainer === undefined) {
    return;
  }

  return {
    ELECTRIC_CONTAINER_AWS_ACCESS_KEY_ID:
      electricContainer.env.AWS_ACCESS_KEY_ID,
    ELECTRIC_CONTAINER_AWS_SECRET_ACCESS_KEY:
      electricContainer.env.AWS_SECRET_ACCESS_KEY,
    ELECTRIC_CONTAINER_DATABASE_URL: electricContainer.env.DATABASE_URL,
    ELECTRIC_CONTAINER_ELECTRIC_SECRET: electricContainer.env.ELECTRIC_SECRET,
    ELECTRIC_CONTAINER_R2_ACCOUNT_ID: electricContainer.env.R2_ACCOUNT_ID,
    ELECTRIC_CONTAINER_R2_BUCKET_NAME: electricContainer.env.R2_BUCKET_NAME,
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
  readonly name: string;
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
  } satisfies InputProps<ContainerApplicationProps>;
}

export function makeSyncWorkerProps(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly config: SyncWorkerStageConfig;
  readonly domain: DomainWorkerResource;
  readonly electricContainer?: ElectricContainerConfig | undefined;
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
    env: makeSyncWorkerEnv({
      analytics: input.analytics,
      config: input.config,
      domain: input.domain,
      electricContainer: input.electricContainer,
      electricSqlLocationHint: input.electricSqlLocationHint,
      electricSourceSecret: input.electricSourceSecret,
      localDev: input.localDev,
      localAppOrigin: input.localAppOrigin,
    }),
    domain: input.hostname,
    observability: syncWorkerObservability,
    url: false,
  } satisfies InputProps<WorkerProps<WorkerEnvShape<SyncWorkerEnv>>>;
}

export function makeSyncWorkerEnv(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly config: SyncWorkerStageConfig;
  readonly domain: DomainWorkerResource;
  readonly electricContainer?: ElectricContainerConfig | undefined;
  readonly electricSqlLocationHint: DurableObjectLocationHint;
  readonly electricSourceSecret: Input<Redacted.Redacted<string>>;
  readonly localDev?: boolean | undefined;
  readonly localAppOrigin?: string | undefined;
}) {
  return {
    ...makeSyncWorkerResourceEnv({
      analytics: input.analytics,
      domain: input.domain,
      localDev: input.localDev,
    }),
    ...makeSyncWorkerConfiguredEnv({
      config: input.config,
      electricContainer: input.electricContainer,
      electricSqlLocationHint: input.electricSqlLocationHint,
      electricSourceSecret: input.electricSourceSecret,
      localDev: input.localDev,
      localAppOrigin: input.localAppOrigin,
    }),
  } satisfies WorkerEnvInput<SyncWorkerEnv>;
}

export function makeSyncWorker(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly config: SyncWorkerStageConfig;
  readonly domain: DomainWorkerResource;
  readonly electricContainer?: ElectricContainerConfig | undefined;
  readonly electricSqlLocationHint: DurableObjectLocationHint;
  readonly electricSourceSecret: Input<Redacted.Redacted<string>>;
  readonly hostname: string;
  readonly localDev?: boolean | undefined;
  readonly localAppOrigin?: string | undefined;
  readonly name: string;
}) {
  return Effect.gen(function* () {
    const worker = yield* Cloudflare.Worker("Sync", makeSyncWorkerProps(input));

    if (input.electricContainer !== undefined) {
      const electricContainer = yield* Cloudflare.Container<unknown>()(
        "ElectricSql",
        makeElectricContainerProps({
          config: input.config,
          name: input.electricContainer.name,
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
