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
    "ELECTRIC_CONTAINER_DATABASE_URL" | "ELECTRIC_CONTAINER_ELECTRIC_SECRET"
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
  readonly ELECTRIC_SQL_JURISDICTION?: DurableObjectJurisdiction;
  readonly ELECTRIC_CONTAINER_DATABASE_URL?: Redacted.Redacted<string>;
  readonly ELECTRIC_CONTAINER_ELECTRIC_SECRET?: Redacted.Redacted<string>;
  readonly ELECTRIC_SQL_LOCATION_HINT: DurableObjectLocationHint;
  readonly ELECTRIC_SOURCE_SECRET: Redacted.Redacted<string>;
  readonly NODE_ENV: "production";
  readonly SYNC_AUTHORIZATION_CACHE_TTL_SECONDS: "10";
}

export interface ElectricContainerConfiguredEnv {
  readonly CEIRD_ELECTRIC_STORAGE_BACKEND: "local";
  readonly DATABASE_URL: Input<Redacted.Redacted<string>>;
  readonly ELECTRIC_INSECURE: "false";
  readonly ELECTRIC_LOG_LEVEL: "info";
  readonly ELECTRIC_PERSISTENT_STATE: "file";
  readonly ELECTRIC_PORT: "3000";
  readonly ELECTRIC_SECRET: Input<Redacted.Redacted<string>>;
  readonly ELECTRIC_SHAPE_DB_EXCLUSIVE_MODE: "true";
  readonly ELECTRIC_STORAGE: "fast_file";
  readonly ELECTRIC_STORAGE_DIR: "/var/lib/electric";
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
  readonly electricSqlJurisdiction?: DurableObjectJurisdiction | undefined;
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
    ...(input.electricSqlJurisdiction === undefined
      ? {}
      : { ELECTRIC_SQL_JURISDICTION: input.electricSqlJurisdiction }),
    ELECTRIC_SQL_LOCATION_HINT: input.electricSqlLocationHint,
    ELECTRIC_SOURCE_SECRET: input.electricSourceSecret,
    NODE_ENV: "production",
    SYNC_AUTHORIZATION_CACHE_TTL_SECONDS: "10",
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
}): ElectricContainerConfiguredEnv {
  return {
    CEIRD_ELECTRIC_STORAGE_BACKEND: "local",
    DATABASE_URL: input.databaseUrl,
    ELECTRIC_INSECURE: "false",
    ELECTRIC_LOG_LEVEL: "info",
    ELECTRIC_PERSISTENT_STATE: "file",
    ELECTRIC_PORT: "3000",
    ELECTRIC_SECRET: input.electricSecret,
    ELECTRIC_SHAPE_DB_EXCLUSIVE_MODE: "true",
    ELECTRIC_STORAGE: "fast_file",
    ELECTRIC_STORAGE_DIR: "/var/lib/electric",
  };
}

function makeSyncWorkerElectricContainerEnv(
  electricContainer: ElectricContainerConfig | undefined
): WorkerEnvInput<SyncWorkerElectricContainerConfiguredEnv> | undefined {
  if (electricContainer === undefined) {
    return;
  }

  return {
    ELECTRIC_CONTAINER_DATABASE_URL: electricContainer.env.DATABASE_URL,
    ELECTRIC_CONTAINER_ELECTRIC_SECRET: electricContainer.env.ELECTRIC_SECRET,
  };
}

export const electricContainerDockerfile = [
  "FROM --platform=linux/amd64 electricsql/electric:subqueries-beta-7",
  "",
  "USER root",
  "RUN set -eux; \\",
  "  apt-get update; \\",
  "  apt-get install -y --no-install-recommends ca-certificates nodejs; \\",
  "  mkdir -p /home/electric /var/lib/electric; \\",
  "  if ! getent group 65532 >/dev/null; then echo 'electric:x:65532:' >> /etc/group; fi; \\",
  "  if ! getent passwd 65532 >/dev/null; then echo 'electric:x:65532:65532:Electric Runtime:/home/electric:/usr/sbin/nologin' >> /etc/passwd; fi; \\",
  "  rm -rf /var/lib/apt/lists/*; \\",
  "  chown -R 65532:65532 /app /home/electric /var/lib/electric",
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
  readonly electricSqlJurisdiction?: DurableObjectJurisdiction | undefined;
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
      electricSqlJurisdiction: input.electricSqlJurisdiction,
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
  readonly electricSqlJurisdiction?: DurableObjectJurisdiction | undefined;
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
      electricSqlJurisdiction: input.electricSqlJurisdiction,
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
  readonly electricSqlJurisdiction?: DurableObjectJurisdiction | undefined;
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
