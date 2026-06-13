import { describe, expect, it } from "@effect/vitest";
import * as Cloudflare from "alchemy/Cloudflare";
import type { WorkerProps } from "alchemy/Cloudflare";
import type { Input } from "alchemy/Input";
import * as Output from "alchemy/Output";
import * as State from "alchemy/State";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import type {
  AgentWorkerBindingEnv,
  AgentWorkerConfiguredEnv,
  AgentWorkerResourceEnv,
} from "../apps/agent/infra/cloudflare-worker.ts";
import {
  makeAgentAiGatewayProps,
  makeAgentWorkerConfiguredEnv,
  makeAgentWorkerProps,
  makeAgentWorkerResourceEnv,
} from "../apps/agent/infra/cloudflare-worker.ts";
import type {
  AgentWorkerBindingRuntimeEnv,
  AgentWorkerConfigEnv,
} from "../apps/agent/src/platform/cloudflare/env.ts";
import type { ApiWorkerConfiguredEnv } from "../apps/api/infra/cloudflare-worker.ts";
import {
  makeApiWorkerConfiguredEnv,
  makeApiWorkerProps,
  makeApiWorkerResourceEnv,
} from "../apps/api/infra/cloudflare-worker.ts";
import type {
  ApiWorkerBindingEnv,
  ApiWorkerBindingRuntimeEnv,
  ApiWorkerConfigEnv,
} from "../apps/api/src/platform/cloudflare/env.ts";
import { makeAppWorkerEnv } from "../apps/app/infra/cloudflare-vite.ts";
import type { AppCloudflareEnv } from "../apps/app/src/cloudflare-env.d.ts";
import type {
  DomainWorkerBindingEnv,
  DomainWorkerConfiguredEnv,
  DomainWorkerResource,
} from "../apps/domain/infra/cloudflare-worker.ts";
import {
  makeDomainWorkerConfiguredEnv,
  makeDomainWorkerProps,
  makeDomainWorkerResourceEnv,
} from "../apps/domain/infra/cloudflare-worker.ts";
import type {
  DomainWorkerBindingRuntimeEnv,
  DomainWorkerConfigEnv,
} from "../apps/domain/src/platform/cloudflare/env.ts";
import type { McpWorkerConfiguredEnv } from "../apps/mcp/infra/cloudflare-worker.ts";
import {
  makeMcpWorkerConfiguredEnv,
  makeMcpWorkerProps,
  makeMcpWorkerResourceEnv,
} from "../apps/mcp/infra/cloudflare-worker.ts";
import type {
  McpWorkerBindingEnv,
  McpWorkerBindingRuntimeEnv,
  McpWorkerConfigEnv,
} from "../apps/mcp/src/platform/cloudflare/env.ts";
import type {
  SyncWorkerBindingEnv,
  SyncWorkerConfiguredEnv,
} from "../apps/sync/infra/cloudflare-worker.ts";
import {
  electricContainerDockerfile,
  makeElectricContainerEnv,
  makeElectricContainerProps,
  makeSyncWorkerConfiguredEnv,
  makeSyncWorkerProps,
  makeSyncWorkerResourceEnv,
} from "../apps/sync/infra/cloudflare-worker.ts";
import type {
  SyncWorkerBindingRuntimeEnv,
  SyncWorkerConfigEnv,
} from "../apps/sync/src/platform/cloudflare/env.ts";
import {
  makeCloudflareR2BucketResourceKey,
  makeR2SecretAccessKey,
} from "./cloudflare-r2.ts";
import type { makeCloudflareStack } from "./cloudflare-stack.ts";
import {
  makeCloudflareHyperdriveProps,
  makeDurableObjectLocationHintForNeonRegion,
  makeLocalWorkerOrigins,
  makePortlessLocalWorkerOrigin,
  makeTenantReservedHostBypassRoutePatterns,
  makeCloudflareWorkerOrigin,
  redactInput,
  shouldProvisionElectricContainer,
  shouldReconcileTenantRouting,
  shouldProvisionElectricStorage,
} from "./cloudflare-stack.ts";
import {
  ceirdDomainWorkerPlacement,
  ceirdWorkerCompatibility,
  ceirdWorkerObservability,
} from "./cloudflare-worker-defaults.ts";
import { configWithoutCloudflareBootstrapSecrets } from "./stages.contract.ts";
import { InfraGoogleMapsApiKey } from "./stages.ts";
import type { InfraStageConfig } from "./stages.ts";

type AssertTrue<Value extends true> = Value;
type HasSameKeys<Type, Expected> = [
  Exclude<keyof Type, keyof Expected>,
  Exclude<keyof Expected, keyof Type>,
] extends [never, never]
  ? true
  : false;
type AllPropertyValuesExtend<Type, Value> =
  Exclude<
    {
      [Key in keyof Type]-?: NonNullable<Type[Key]> extends Value ? never : Key;
    }[keyof Type],
    never
  > extends never
    ? true
    : false;
type RequiredNonNullableProperties<Type> = {
  readonly [Key in keyof Type]-?: NonNullable<Type[Key]>;
};

interface DomainWorkerDeployedResourceEnvForAssertions {
  readonly ANALYTICS: Input<Cloudflare.AnalyticsEngineDataset>;
  readonly AUTH_EMAIL: Input<Cloudflare.SendEmail>;
  readonly AUTH_EMAIL_QUEUE: Input<Cloudflare.Queue>;
  readonly DATABASE: Input<Cloudflare.Hyperdrive>;
}

interface DomainWorkerDeployedEnvForAssertions {
  readonly ANALYTICS: unknown;
  readonly AUTH_EMAIL_QUEUE: unknown;
  readonly DATABASE: unknown;
}

interface DomainWorkerLocalEnvForAssertions {
  readonly AUTH_APP_ORIGIN: unknown;
  readonly AUTH_COOKIE_DOMAIN?: unknown;
  readonly AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED?: unknown;
  readonly AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE: unknown;
  readonly AUTH_RATE_LIMIT_CLEANUP_ENABLED: unknown;
  readonly AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES: unknown;
  readonly AUTH_RATE_LIMIT_RETENTION_HOURS: unknown;
  readonly AUTH_TRUSTED_ORIGINS: unknown;
  readonly BETTER_AUTH_BASE_URL: unknown;
  readonly DATABASE: unknown;
  readonly CEIRD_LOCAL_DEV?: unknown;
  readonly DATABASE_URL?: unknown;
  readonly MCP_RESOURCE_URL: unknown;
}

function isInputEffect<Value>(
  value: Input<Value>
): value is Effect.Effect<Value, never, never> {
  return Effect.isEffect(value);
}

function assertDeployedDomainWorkerResourceEnv(
  value: ReturnType<typeof makeDomainWorkerResourceEnv>
): asserts value is DomainWorkerDeployedResourceEnvForAssertions {
  if (
    typeof value !== "object" ||
    value === null ||
    !("ANALYTICS" in value) ||
    !("AUTH_EMAIL" in value) ||
    !("AUTH_EMAIL_QUEUE" in value) ||
    !("DATABASE" in value)
  ) {
    throw new Error("Expected deployed domain Worker resource env");
  }
}

function assertDeployedDomainWorkerEnv(
  value: ReturnType<typeof makeDomainWorkerProps>["env"]
): asserts value is ReturnType<typeof makeDomainWorkerProps>["env"] &
  DomainWorkerDeployedEnvForAssertions {
  if (
    value === undefined ||
    typeof value !== "object" ||
    value === null ||
    !("ANALYTICS" in value) ||
    !("AUTH_EMAIL_QUEUE" in value) ||
    !("DATABASE" in value)
  ) {
    throw new Error("Expected deployed domain Worker env");
  }
}

function assertLocalDomainWorkerEnv(
  value: ReturnType<typeof makeDomainWorkerProps>["env"]
): asserts value is ReturnType<typeof makeDomainWorkerProps>["env"] &
  DomainWorkerLocalEnvForAssertions {
  if (
    value === undefined ||
    typeof value !== "object" ||
    value === null ||
    !("AUTH_APP_ORIGIN" in value) ||
    !("AUTH_RATE_LIMIT_CLEANUP_ENABLED" in value) ||
    !("DATABASE" in value) ||
    !("MCP_RESOURCE_URL" in value) ||
    "ANALYTICS" in value ||
    "AUTH_EMAIL_QUEUE" in value ||
    "AUTH_EMAIL" in value
  ) {
    throw new Error("Expected local domain Worker env");
  }
}

const domainWorkerBindingKeys = [
  "ANALYTICS",
  "AUTH_EMAIL",
  "AUTH_EMAIL_QUEUE",
  "DATABASE",
] as const satisfies readonly (keyof DomainWorkerBindingEnv)[];
const apiWorkerBindingKeys = [
  "ANALYTICS",
  "DOMAIN",
] as const satisfies readonly (keyof ApiWorkerBindingEnv)[];
const mcpWorkerBindingKeys = [
  "ANALYTICS",
  "DOMAIN",
] as const satisfies readonly (keyof McpWorkerBindingEnv)[];
const syncWorkerBindingKeys = [
  "ANALYTICS",
  "DOMAIN",
  "ElectricSql",
] as const satisfies readonly (keyof SyncWorkerBindingEnv)[];
const agentWorkerResourceBindingKeys = [
  "AI",
  "ANALYTICS",
  "CeirdAgent",
  "DOMAIN",
] as const satisfies readonly (keyof AgentWorkerResourceEnv)[];

const domainWorkerBindingKeysMatchRuntimeContract: AssertTrue<
  HasSameKeys<DomainWorkerBindingEnv, DomainWorkerBindingRuntimeEnv>
> = true;
const domainWorkerEnvSatisfiesRuntimeContract: AssertTrue<
  DomainWorkerBindingEnv extends DomainWorkerBindingRuntimeEnv ? true : false
> = true;
const domainWorkerRuntimeContractSatisfiesEnv: AssertTrue<
  RequiredNonNullableProperties<DomainWorkerBindingRuntimeEnv> extends DomainWorkerBindingEnv
    ? true
    : false
> = true;

const apiWorkerBindingKeysMatchRuntimeContract: AssertTrue<
  HasSameKeys<ApiWorkerBindingEnv, ApiWorkerBindingRuntimeEnv>
> = true;
const apiWorkerEnvSatisfiesRuntimeContract: AssertTrue<
  ApiWorkerBindingEnv extends ApiWorkerBindingRuntimeEnv ? true : false
> = true;
const apiWorkerRuntimeContractSatisfiesEnv: AssertTrue<
  RequiredNonNullableProperties<ApiWorkerBindingRuntimeEnv> extends ApiWorkerBindingEnv
    ? true
    : false
> = true;
const mcpWorkerBindingKeysMatchRuntimeContract: AssertTrue<
  HasSameKeys<McpWorkerBindingEnv, McpWorkerBindingRuntimeEnv>
> = true;
const mcpWorkerEnvSatisfiesRuntimeContract: AssertTrue<
  McpWorkerBindingEnv extends McpWorkerBindingRuntimeEnv ? true : false
> = true;
const mcpWorkerRuntimeContractSatisfiesEnv: AssertTrue<
  RequiredNonNullableProperties<McpWorkerBindingRuntimeEnv> extends McpWorkerBindingEnv
    ? true
    : false
> = true;
const agentWorkerBindingKeysMatchRuntimeContract: AssertTrue<
  HasSameKeys<AgentWorkerBindingEnv, AgentWorkerBindingRuntimeEnv>
> = true;
const agentWorkerEnvSatisfiesRuntimeContract: AssertTrue<
  AgentWorkerBindingEnv extends AgentWorkerBindingRuntimeEnv ? true : false
> = true;
const agentWorkerRuntimeContractSatisfiesEnv: AssertTrue<
  RequiredNonNullableProperties<AgentWorkerBindingRuntimeEnv> extends AgentWorkerBindingEnv
    ? true
    : false
> = true;
const syncWorkerBindingKeysMatchRuntimeContract: AssertTrue<
  HasSameKeys<SyncWorkerBindingEnv, SyncWorkerBindingRuntimeEnv>
> = true;
const syncWorkerEnvSatisfiesRuntimeContract: AssertTrue<
  SyncWorkerBindingEnv extends SyncWorkerBindingRuntimeEnv ? true : false
> = true;
const syncWorkerRuntimeContractSatisfiesEnv: AssertTrue<
  RequiredNonNullableProperties<SyncWorkerBindingRuntimeEnv> extends SyncWorkerBindingEnv
    ? true
    : false
> = true;
interface AlchemyInjectedWorkerEnv {
  readonly ALCHEMY_STACK_NAME: string;
  readonly ALCHEMY_STAGE: string;
}
type ApiWorkerStackRuntimeConfigEnv = Required<
  Pick<
    ApiWorkerConfigEnv,
    | "ALCHEMY_STACK_NAME"
    | "ALCHEMY_STAGE"
    | "CEIRD_WORKER_ANALYTICS_SAMPLE_RATE"
    | "NODE_ENV"
  >
>;
type DomainWorkerStackRuntimeConfigEnv = Required<
  Pick<
    DomainWorkerConfigEnv,
    | "ALCHEMY_STACK_NAME"
    | "ALCHEMY_STAGE"
    | "AGENT_ACTION_RUN_STALE_AFTER_SECONDS"
    | "AGENT_INTERNAL_SECRET"
    | "AUTH_APP_ORIGIN"
    | "AUTH_COOKIE_PREFIX"
    | "AUTH_EMAIL_FROM"
    | "AUTH_EMAIL_FROM_NAME"
    | "AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE"
    | "AUTH_RATE_LIMIT_CLEANUP_ENABLED"
    | "AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES"
    | "AUTH_RATE_LIMIT_RETENTION_HOURS"
    | "AUTH_RATE_LIMIT_ENABLED"
    | "AUTH_TRUSTED_ORIGINS"
    | "BETTER_AUTH_BASE_URL"
    | "BETTER_AUTH_SECRET"
    | "CEIRD_ROUTE_PROVIDER"
    | "CEIRD_WORKER_ANALYTICS_SAMPLE_RATE"
    | "GOOGLE_MAPS_API_KEY"
    | "MCP_RESOURCE_URL"
    | "NODE_ENV"
    | "OAUTH_ISSUER_URL"
  >
> &
  Pick<
    DomainWorkerConfigEnv,
    | "MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES"
    | "MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS"
    | "AUTH_COOKIE_DOMAIN"
    | "AUTH_CAPTCHA_ENABLED"
    | "AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE"
    | "AUTH_CAPTCHA_TURNSTILE_SECRET_KEY"
    | "AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED"
    | "AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE"
    | "BETTER_AUTH_SECRETS"
    | "CEIRD_LOCAL_DEV"
    | "DATABASE_URL"
    | "GOOGLE_MAPS_ROUTES_API_KEY"
    | "PROXIMITY_ORIGIN_TOKEN_TTL_SECONDS"
  >;
type McpWorkerStackRuntimeConfigEnv = Required<
  Pick<
    McpWorkerConfigEnv,
    | "ALCHEMY_STACK_NAME"
    | "ALCHEMY_STAGE"
    | "CEIRD_WORKER_ANALYTICS_SAMPLE_RATE"
    | "NODE_ENV"
  >
>;
type AgentWorkerStackRuntimeConfigEnv = Required<
  Pick<
    AgentWorkerConfigEnv,
    | "ALCHEMY_STACK_NAME"
    | "ALCHEMY_STAGE"
    | "AGENT_AI_GATEWAY_ID"
    | "AGENT_INTERNAL_SECRET"
    | "AUTH_APP_ORIGIN"
    | "AUTH_TRUSTED_ORIGINS"
    | "CEIRD_WORKER_ANALYTICS_SAMPLE_RATE"
    | "NODE_ENV"
  >
> &
  Pick<
    AgentWorkerConfigEnv,
    "AGENT_MUTATION_TOOLS_ENABLED" | "CEIRD_LOCAL_DEV"
  >;
type SyncWorkerStackRuntimeConfigEnv = Required<
  Pick<
    SyncWorkerConfigEnv,
    | "ALCHEMY_STACK_NAME"
    | "ALCHEMY_STAGE"
    | "AUTH_APP_ORIGIN"
    | "AUTH_TRUSTED_ORIGINS"
    | "CEIRD_WORKER_ANALYTICS_SAMPLE_RATE"
    | "ELECTRIC_SQL_LOCATION_HINT"
    | "ELECTRIC_SOURCE_SECRET"
    | "NODE_ENV"
  >
> &
  Pick<
    SyncWorkerConfigEnv,
    | "ELECTRIC_CONTAINER_AWS_ACCESS_KEY_ID"
    | "ELECTRIC_CONTAINER_AWS_SECRET_ACCESS_KEY"
    | "ELECTRIC_CONTAINER_DATABASE_URL"
    | "ELECTRIC_CONTAINER_ELECTRIC_SECRET"
    | "ELECTRIC_CONTAINER_R2_ACCOUNT_ID"
    | "ELECTRIC_CONTAINER_R2_BUCKET_NAME"
  >;
type ApiWorkerStackEnv = ApiWorkerConfiguredEnv & AlchemyInjectedWorkerEnv;
type DomainWorkerStackEnv = DomainWorkerConfiguredEnv &
  AlchemyInjectedWorkerEnv;
type McpWorkerStackEnv = McpWorkerConfiguredEnv & AlchemyInjectedWorkerEnv;
type AgentWorkerStackEnv = AgentWorkerConfiguredEnv & AlchemyInjectedWorkerEnv;
type SyncWorkerStackEnv = SyncWorkerConfiguredEnv & AlchemyInjectedWorkerEnv;
type DomainWorkerRuntimeStringValueKeys = Exclude<
  keyof DomainWorkerStackRuntimeConfigEnv,
  | "AGENT_INTERNAL_SECRET"
  | "AUTH_EMAIL_FROM"
  | "AUTH_CAPTCHA_TURNSTILE_SECRET_KEY"
  | "BETTER_AUTH_SECRET"
  | "BETTER_AUTH_SECRETS"
  | "DATABASE_URL"
  | "GOOGLE_MAPS_API_KEY"
  | "GOOGLE_MAPS_ROUTES_API_KEY"
>;
type DomainWorkerRuntimeStringValueEnv = Pick<
  DomainWorkerStackRuntimeConfigEnv,
  DomainWorkerRuntimeStringValueKeys
>;
type DomainWorkerStackStringValueEnv = Pick<
  DomainWorkerStackEnv,
  DomainWorkerRuntimeStringValueKeys
>;
type WorkerEnvValue = NonNullable<WorkerProps["env"]>[string];
type WorkerConfiguredEnvInputValue = Input<WorkerEnvValue>;
const apiWorkerConfiguredEnvKeysMatchRuntimeConfig: AssertTrue<
  HasSameKeys<ApiWorkerStackEnv, ApiWorkerStackRuntimeConfigEnv>
> = true;
const domainWorkerConfiguredEnvKeysMatchRuntimeConfig: AssertTrue<
  HasSameKeys<DomainWorkerStackEnv, DomainWorkerStackRuntimeConfigEnv>
> = true;
const mcpWorkerConfiguredEnvKeysMatchRuntimeConfig: AssertTrue<
  HasSameKeys<McpWorkerStackEnv, McpWorkerStackRuntimeConfigEnv>
> = true;
const agentWorkerConfiguredEnvKeysMatchRuntimeConfig: AssertTrue<
  HasSameKeys<AgentWorkerStackEnv, AgentWorkerStackRuntimeConfigEnv>
> = true;
const syncWorkerConfiguredEnvKeysMatchRuntimeConfig: AssertTrue<
  HasSameKeys<SyncWorkerStackEnv, SyncWorkerStackRuntimeConfigEnv>
> = true;
const domainWorkerConfiguredStringValuesSatisfyRuntimeConfig: AssertTrue<
  DomainWorkerStackStringValueEnv extends DomainWorkerRuntimeStringValueEnv
    ? true
    : false
> = true;
const apiWorkerConfiguredValuesSatisfyAlchemyWorkerEnv: AssertTrue<
  AllPropertyValuesExtend<ApiWorkerConfiguredEnv, WorkerEnvValue>
> = true;
const domainWorkerConfiguredValuesSatisfyAlchemyWorkerEnv: AssertTrue<
  AllPropertyValuesExtend<DomainWorkerConfiguredEnv, WorkerEnvValue>
> = true;
const mcpWorkerConfiguredValuesSatisfyAlchemyWorkerEnv: AssertTrue<
  AllPropertyValuesExtend<McpWorkerConfiguredEnv, WorkerEnvValue>
> = true;
const agentWorkerConfiguredValuesSatisfyAlchemyWorkerEnv: AssertTrue<
  AllPropertyValuesExtend<AgentWorkerConfiguredEnv, WorkerEnvValue>
> = true;
const syncWorkerConfiguredValuesSatisfyAlchemyWorkerEnv: AssertTrue<
  AllPropertyValuesExtend<SyncWorkerConfiguredEnv, WorkerEnvValue>
> = true;

type AppWorkerStackEnv = ReturnType<typeof makeAppWorkerEnv> &
  AlchemyInjectedWorkerEnv;
type AppWorkerRuntimeStackEnv = AppCloudflareEnv;
const appWorkerEnvKeysMatchAppContract: AssertTrue<
  HasSameKeys<AppWorkerStackEnv, AppCloudflareEnv>
> = true;
const appWorkerRuntimeEnvSatisfiesAppContract: AssertTrue<
  AppWorkerRuntimeStackEnv extends AppCloudflareEnv ? true : false
> = true;
const appContractSatisfiesStackEnv: AssertTrue<
  AppCloudflareEnv extends AppWorkerRuntimeStackEnv ? true : false
> = true;
const appWorkerConfiguredValuesSatisfyAlchemyWorkerEnv: AssertTrue<
  AllPropertyValuesExtend<
    ReturnType<typeof makeAppWorkerEnv>,
    WorkerConfiguredEnvInputValue
  >
> = true;
type EffectSuccess<Value> =
  Value extends Effect.Effect<infer Success, never, unknown> ? Success : never;
type CloudflareStackResources = EffectSuccess<
  ReturnType<typeof makeCloudflareStack>
>;
const cloudflareStackOutputsIncludeCanonicalOrigins: AssertTrue<
  CloudflareStackResources extends {
    readonly apiOrigin: Input<string>;
    readonly agentOrigin: Input<string>;
    readonly appOrigin: Input<string>;
    readonly mcpOrigin: Input<string>;
    readonly syncOrigin: Input<string>;
  }
    ? true
    : false
> = true;
const cloudflareStackOutputsIncludeElectricStorage: AssertTrue<
  CloudflareStackResources extends {
    readonly electricStorageBucket: Cloudflare.R2Bucket | undefined;
  }
    ? true
    : false
> = true;
const cloudflareStackOutputsIncludeTenantRouting: AssertTrue<
  CloudflareStackResources extends {
    readonly tenantReservedHostBypassRoutePatterns: readonly Input<string>[];
    readonly tenantRoutePattern: Input<string> | undefined;
    readonly tenantWildcardDnsRecordId: Input<string> | undefined;
  }
    ? true
    : false
> = true;
const cloudflareStackOutputsIncludeWorkerAnalytics: AssertTrue<
  CloudflareStackResources extends {
    readonly workerAnalyticsDataset: Input<string>;
  }
    ? true
    : false
> = true;
void cloudflareStackOutputsIncludeWorkerAnalytics;

describe("Cloudflare stack", () => {
  const workerAnalytics = {
    dataset: "ceird-main-worker-analytics",
    kind: "Cloudflare.AnalyticsEngineDataset",
    name: "WorkerAnalytics",
  } as unknown as Cloudflare.AnalyticsEngineDataset;
  const previewTenantConfig = {
    ...configWithoutCloudflareBootstrapSecrets,
    agentHostname: "agent.pr-123.example.com",
    apiHostname: "api.pr-123.example.com",
    appHostname: "app.pr-123.example.com",
    authCookieDomain: "example.com",
    authCookiePrefix: "ceird-pr-123",
    mcpHostname: "mcp.pr-123.example.com",
    syncHostname: "sync.pr-123.example.com",
    stage: "pr-123",
    tenantReservedHostnames: [
      "app.pr-123.example.com",
      "api.pr-123.example.com",
      "agent.pr-123.example.com",
      "mcp.pr-123.example.com",
      "sync.pr-123.example.com",
    ],
    tenantBaseDomain: "example.com",
    tenantRoutePattern: "*--pr-123.example.com/*",
    tenantStageAlias: "pr-123",
    tenantTrustedOriginPattern: "https://*--pr-123.example.com",
  } satisfies InfraStageConfig;

  it("lets Alchemy own runtime stage injection for Worker env vars", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");
    const agentInternalSecret = Redacted.make("agent-secret");
    const apiEnv = makeApiWorkerConfiguredEnv({
      workerAnalyticsSampleRate:
        configWithoutCloudflareBootstrapSecrets.workerAnalyticsSampleRate,
    });
    const domainEnv = makeDomainWorkerConfiguredEnv({
      agentInternalSecret,
      betterAuthSecret,
      config: configWithoutCloudflareBootstrapSecrets,
    });
    const mcpEnv = makeMcpWorkerConfiguredEnv({
      workerAnalyticsSampleRate:
        configWithoutCloudflareBootstrapSecrets.workerAnalyticsSampleRate,
    });
    const agentEnv = makeAgentWorkerConfiguredEnv({
      aiGatewayId: "ceird-main-agent-ai",
      agentInternalSecret,
      config: configWithoutCloudflareBootstrapSecrets,
    });
    const appEnv = makeAppWorkerEnv({
      agentOrigin: "https://agent.example.com",
      apiOrigin: "https://api.example.com",
      config: configWithoutCloudflareBootstrapSecrets,
      syncOrigin: "https://sync.example.com",
    });
    const syncEnv = makeSyncWorkerConfiguredEnv({
      config: configWithoutCloudflareBootstrapSecrets,
      electricSqlLocationHint: "weur",
      electricSourceSecret: Redacted.make("electric-secret"),
    });

    expect(apiEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(domainEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(mcpEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(agentEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(appEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(syncEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(apiEnv).toStrictEqual({
      CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
      NODE_ENV: "production",
    });
    expect(domainEnv).toMatchObject({
      AGENT_ACTION_RUN_STALE_AFTER_SECONDS: "900",
      AGENT_INTERNAL_SECRET: agentInternalSecret,
      AUTH_APP_ORIGIN: "https://app.example.com",
      AUTH_COOKIE_DOMAIN: "example.com",
      AUTH_COOKIE_PREFIX: "ceird-main",
      AUTH_EMAIL_FROM_NAME: "Ceird",
      AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE: "1000",
      AUTH_RATE_LIMIT_CLEANUP_ENABLED: "true",
      AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES: "10",
      AUTH_RATE_LIMIT_RETENTION_HOURS: "48",
      AUTH_RATE_LIMIT_ENABLED: "true",
      AUTH_TRUSTED_ORIGINS:
        "https://app.example.com,https://*--main.example.com",
      BETTER_AUTH_BASE_URL: "https://api.example.com/api/auth",
      CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
      MCP_RESOURCE_URL: "https://mcp.example.com/mcp",
      NODE_ENV: "production",
      OAUTH_ISSUER_URL: "https://api.example.com/api/auth",
    });
    expect(domainEnv.BETTER_AUTH_SECRET).toBe(betterAuthSecret);
    expect(domainEnv.BETTER_AUTH_SECRETS).toBeUndefined();
    expect(domainEnv.AUTH_CAPTCHA_ENABLED).toBeUndefined();
    expect(domainEnv.AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE).toBeUndefined();
    expect(domainEnv.AUTH_CAPTCHA_TURNSTILE_SECRET_KEY).toBeUndefined();
    expect(domainEnv.AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED).toBeUndefined();
    expect(
      domainEnv.AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE
    ).toBeUndefined();
    expect(mcpEnv).toStrictEqual({
      CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
      NODE_ENV: "production",
    });
    expect(agentEnv).toStrictEqual({
      AGENT_AI_GATEWAY_ID: "ceird-main-agent-ai",
      AGENT_INTERNAL_SECRET: agentInternalSecret,
      AUTH_APP_ORIGIN: "https://app.example.com",
      AUTH_TRUSTED_ORIGINS:
        "https://app.example.com,https://*--main.example.com",
      CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
      NODE_ENV: "production",
    });
    expect(agentEnv).not.toHaveProperty("AGENT_MUTATION_TOOLS_ENABLED");
    expect(
      makeAgentWorkerConfiguredEnv({
        aiGatewayId: "ceird-main-agent-ai",
        agentInternalSecret,
        config: configWithoutCloudflareBootstrapSecrets,
        enableMutationTools: true,
      }).AGENT_MUTATION_TOOLS_ENABLED
    ).toBe("true");
    expect(appEnv).toStrictEqual({
      AGENT_ORIGIN: "https://agent.example.com",
      API_ORIGIN: "https://api.example.com",
      CEIRD_CLOUDFLARE: "1",
      SYNC_ORIGIN: "https://sync.example.com",
      SYSTEM_APP_ORIGIN: "https://app.example.com",
      TENANT_BASE_DOMAIN: "example.com",
      TENANT_HOST_MODE: "stage",
      TENANT_RESERVED_HOSTNAMES:
        "app.example.com,api.example.com,agent.example.com,mcp.example.com,sync.example.com",
      TENANT_STAGE_ALIAS: "main",
      VITE_AGENT_ORIGIN: "https://agent.example.com",
      VITE_API_ORIGIN: "https://api.example.com",
      VITE_SYNC_ORIGIN: "https://sync.example.com",
      VITE_SYSTEM_APP_ORIGIN: "https://app.example.com",
      VITE_TENANT_BASE_DOMAIN: "example.com",
      VITE_TENANT_HOST_MODE: "stage",
      VITE_TENANT_RESERVED_HOSTNAMES:
        "app.example.com,api.example.com,agent.example.com,mcp.example.com,sync.example.com",
      VITE_TENANT_STAGE_ALIAS: "main",
    });
    expect(syncEnv).toMatchObject({
      AUTH_APP_ORIGIN: "https://app.example.com",
      AUTH_TRUSTED_ORIGINS:
        "https://app.example.com,https://*--main.example.com",
      CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
      ELECTRIC_SQL_LOCATION_HINT: "weur",
      NODE_ENV: "production",
    });
  });

  it("unwraps redacted Domain runtime secrets for the local workerd env", () => {
    const agentInternalSecret = Redacted.make("agent-secret");
    const betterAuthSecret = Redacted.make("better-auth-secret");
    const betterAuthSecrets = Redacted.make(
      "2:current-secret-value-0123456789abcdef,1:previous-secret-value-0123456789abcdef"
    );
    const authEmailFrom = Redacted.make("local-auth@example.com");
    const turnstileSecretKey = Redacted.make("turnstile-secret-key");
    const googleMapsApiKey = Redacted.make(
      Schema.decodeUnknownSync(InfraGoogleMapsApiKey)("google-maps-key")
    );
    const googleMapsRoutesApiKey = Redacted.make(
      Schema.decodeUnknownSync(InfraGoogleMapsApiKey)("google-routes-key")
    );

    const domainEnv = makeDomainWorkerConfiguredEnv({
      agentInternalSecret,
      betterAuthSecret,
      betterAuthSecrets,
      config: {
        ...configWithoutCloudflareBootstrapSecrets,
        authCaptchaTurnstileSecretKey: turnstileSecretKey,
        authEmailFrom,
        googleMapsApiKey,
        googleMapsRoutesApiKey,
      },
      localDev: true,
    });

    expect(domainEnv.AGENT_INTERNAL_SECRET).toBe(
      Redacted.value(agentInternalSecret)
    );
    expect(domainEnv.AUTH_CAPTCHA_TURNSTILE_SECRET_KEY).toBe(
      Redacted.value(turnstileSecretKey)
    );
    expect(domainEnv.AUTH_EMAIL_FROM).toBe(Redacted.value(authEmailFrom));
    expect(domainEnv.BETTER_AUTH_SECRET).toBe(Redacted.value(betterAuthSecret));
    expect(domainEnv.BETTER_AUTH_SECRETS).toBe(
      Redacted.value(betterAuthSecrets)
    );
    expect(domainEnv.GOOGLE_MAPS_API_KEY).toBe(
      Redacted.value(googleMapsApiKey)
    );
    expect(domainEnv.GOOGLE_MAPS_ROUTES_API_KEY).toBe(
      Redacted.value(googleMapsRoutesApiKey)
    );
  });

  it("passes tenant host config to app and auth domain Workers", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");
    const agentInternalSecret = Redacted.make("agent-secret");
    const appEnv = makeAppWorkerEnv({
      agentOrigin: "https://agent.pr-123.example.com",
      apiOrigin: "https://api.pr-123.example.com",
      config: previewTenantConfig,
      syncOrigin: "https://sync.pr-123.example.com",
    });
    const domainEnv = makeDomainWorkerConfiguredEnv({
      agentInternalSecret,
      betterAuthSecret,
      config: previewTenantConfig,
    });
    const agentEnv = makeAgentWorkerConfiguredEnv({
      aiGatewayId: "ceird-pr-123-agent-ai",
      agentInternalSecret,
      config: previewTenantConfig,
    });

    expect(appEnv.SYSTEM_APP_ORIGIN).toBe("https://app.pr-123.example.com");
    expect(appEnv.TENANT_BASE_DOMAIN).toBe("example.com");
    expect(appEnv.TENANT_HOST_MODE).toBe("stage");
    expect(appEnv.TENANT_RESERVED_HOSTNAMES).toBe(
      "app.pr-123.example.com,api.pr-123.example.com,agent.pr-123.example.com,mcp.pr-123.example.com,sync.pr-123.example.com"
    );
    expect(appEnv.SYNC_ORIGIN).toBe("https://sync.pr-123.example.com");
    expect(appEnv.TENANT_STAGE_ALIAS).toBe("pr-123");
    expect(appEnv.VITE_SYSTEM_APP_ORIGIN).toBe(
      "https://app.pr-123.example.com"
    );
    expect(appEnv.VITE_TENANT_BASE_DOMAIN).toBe("example.com");
    expect(appEnv.VITE_TENANT_HOST_MODE).toBe("stage");
    expect(appEnv.VITE_TENANT_RESERVED_HOSTNAMES).toBe(
      "app.pr-123.example.com,api.pr-123.example.com,agent.pr-123.example.com,mcp.pr-123.example.com,sync.pr-123.example.com"
    );
    expect(appEnv.VITE_SYNC_ORIGIN).toBe("https://sync.pr-123.example.com");
    expect(appEnv.VITE_TENANT_STAGE_ALIAS).toBe("pr-123");
    expect(domainEnv.AUTH_APP_ORIGIN).toBe("https://app.pr-123.example.com");
    expect(domainEnv.AUTH_COOKIE_DOMAIN).toBe("example.com");
    expect(domainEnv.AUTH_COOKIE_PREFIX).toBe("ceird-pr-123");
    expect(domainEnv.AUTH_TRUSTED_ORIGINS.split(",")).toStrictEqual([
      "https://app.pr-123.example.com",
      "https://*--pr-123.example.com",
    ]);
    expect(agentEnv.AUTH_APP_ORIGIN).toBe("https://app.pr-123.example.com");
    expect(agentEnv.AUTH_TRUSTED_ORIGINS.split(",")).toStrictEqual([
      "https://app.pr-123.example.com",
      "https://*--pr-123.example.com",
    ]);
    expect(agentEnv).not.toHaveProperty("AGENT_MUTATION_TOOLS_ENABLED");
  });

  it("creates no-script bypass routes for preview system hosts", () => {
    expect(
      makeTenantReservedHostBypassRoutePatterns(previewTenantConfig)
    ).toStrictEqual([
      "app.pr-123.example.com/*",
      "api.pr-123.example.com/*",
      "agent.pr-123.example.com/*",
      "mcp.pr-123.example.com/*",
      "sync.pr-123.example.com/*",
    ]);
  });

  it("skips reserved host bypass routes when tenant routing is disabled", () => {
    expect(
      makeTenantReservedHostBypassRoutePatterns({
        tenantReservedHostnames: previewTenantConfig.tenantReservedHostnames,
        tenantRoutePattern: undefined,
      })
    ).toStrictEqual([]);
  });

  it("reconciles tenant routing only outside local Alchemy dev", () => {
    expect(
      shouldReconcileTenantRouting({
        localDev: false,
        tenantRoutePattern: previewTenantConfig.tenantRoutePattern,
      })
    ).toBe(true);
    expect(
      shouldReconcileTenantRouting({
        localDev: true,
        tenantRoutePattern: previewTenantConfig.tenantRoutePattern,
      })
    ).toBe(false);
    expect(
      shouldReconcileTenantRouting({
        localDev: false,
        tenantRoutePattern: undefined,
      })
    ).toBe(false);
  });

  it("provisions Electric storage for local and ordinary stages but skips preview probes", () => {
    expect(
      Effect.runSync(
        shouldProvisionElectricStorage({
          config: configWithoutCloudflareBootstrapSecrets,
          localDev: true,
        })
      )
    ).toBe(true);
    expect(
      Effect.runSync(
        shouldProvisionElectricStorage({
          config: configWithoutCloudflareBootstrapSecrets,
          localDev: false,
        })
      )
    ).toBe(true);
    expect(
      Effect.runSync(
        shouldProvisionElectricStorage({
          config: previewTenantConfig,
          localDev: false,
        })
      )
    ).toBe(false);
    expect(
      Effect.runSync(
        shouldProvisionElectricStorage({
          config: {
            ...configWithoutCloudflareBootstrapSecrets,
            stage: "ci-123-1",
          },
          localDev: false,
        })
      )
    ).toBe(false);
    expect(
      Effect.runSync(
        shouldProvisionElectricStorage({
          config: {
            ...configWithoutCloudflareBootstrapSecrets,
            stage: "codex-electric-storage",
          },
          localDev: false,
        })
      )
    ).toBe(true);
  });

  it("creates the Electric container only outside local Alchemy dev", () => {
    const electricStorageCredentials = {
      accessKeyId: "electric-access-key-id",
      secretAccessKey: "electric-secret-access-key",
    };

    expect(
      shouldProvisionElectricContainer({
        electricStorageCredentials,
        localDev: true,
      })
    ).toBe(false);
    expect(
      shouldProvisionElectricContainer({
        electricStorageCredentials,
        localDev: false,
      })
    ).toBe(true);
    expect(
      shouldProvisionElectricContainer({
        electricStorageCredentials: undefined,
        localDev: false,
      })
    ).toBe(false);
  });

  it("sets cross-subdomain auth cookies from the configured tenant base domain", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");
    const agentInternalSecret = Redacted.make("agent-secret");
    const domainEnv = makeDomainWorkerConfiguredEnv({
      agentInternalSecret,
      betterAuthSecret,
      config: {
        ...configWithoutCloudflareBootstrapSecrets,
        apiHostname: "api.ceird.app",
        appHostname: "app.ceird.app",
        authCookieDomain: "ceird.app",
        mcpHostname: "mcp.ceird.app",
        tenantBaseDomain: "ceird.app",
        tenantTrustedOriginPattern: "https://*.ceird.app",
      },
    });

    expect(domainEnv.AUTH_COOKIE_DOMAIN).toBe("ceird.app");
  });

  it("passes the optional Google Routes key to domain Workers", () => {
    const googleMapsRoutesApiKey = Redacted.make(
      Schema.decodeUnknownSync(InfraGoogleMapsApiKey)("google-routes-key")
    );
    const domainEnv = makeDomainWorkerConfiguredEnv({
      agentInternalSecret: Redacted.make("agent-secret"),
      betterAuthSecret: Redacted.make("better-auth-secret"),
      config: {
        ...configWithoutCloudflareBootstrapSecrets,
        googleMapsRoutesApiKey,
      } satisfies InfraStageConfig,
    });

    expect(domainEnv.GOOGLE_MAPS_API_KEY).toBe(
      configWithoutCloudflareBootstrapSecrets.googleMapsApiKey
    );
    expect(domainEnv.GOOGLE_MAPS_ROUTES_API_KEY).toBe(googleMapsRoutesApiKey);
  });

  it("passes the selected route provider to domain Workers", () => {
    const domainEnv = makeDomainWorkerConfiguredEnv({
      agentInternalSecret: Redacted.make("agent-secret"),
      betterAuthSecret: Redacted.make("better-auth-secret"),
      config: {
        ...configWithoutCloudflareBootstrapSecrets,
        routeProvider: "test",
      } satisfies InfraStageConfig,
    });

    expect(domainEnv.CEIRD_ROUTE_PROVIDER).toBe("test");
  });

  it("passes the optional proximity origin token TTL to domain Workers", () => {
    const domainEnv = makeDomainWorkerConfiguredEnv({
      agentInternalSecret: Redacted.make("agent-secret"),
      betterAuthSecret: Redacted.make("better-auth-secret"),
      config: {
        ...configWithoutCloudflareBootstrapSecrets,
        proximityOriginTokenTtlSeconds: 600,
      } satisfies InfraStageConfig,
    });

    expect(domainEnv.PROXIMITY_ORIGIN_TOKEN_TTL_SECONDS).toBe("600");
  });

  it("passes disabled auth rate limits through to preview domain Workers", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");
    const agentInternalSecret = Redacted.make("agent-secret");

    expect(
      makeDomainWorkerConfiguredEnv({
        agentInternalSecret,
        betterAuthSecret,
        config: {
          ...configWithoutCloudflareBootstrapSecrets,
          authRateLimitEnabled: false,
          stage: "pr-104",
        },
      })
    ).toMatchObject({
      AUTH_RATE_LIMIT_ENABLED: "false",
    });
  });

  it("passes configured password compromise check overrides through to domain Workers", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");
    const agentInternalSecret = Redacted.make("agent-secret");

    expect(
      makeDomainWorkerConfiguredEnv({
        agentInternalSecret,
        betterAuthSecret,
        config: {
          ...configWithoutCloudflareBootstrapSecrets,
          authPasswordCompromiseCheckEnabled: false,
          authPasswordCompromiseCheckRangeUrlOverride:
            "http://127.0.0.1:8790/range",
        },
      })
    ).toMatchObject({
      AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED: "false",
      AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE:
        "http://127.0.0.1:8790/range",
    });
  });

  it("passes configured Turnstile captcha settings to domain and app Workers", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");
    const agentInternalSecret = Redacted.make("agent-secret");
    const turnstileSecretKey = Redacted.make("turnstile-secret-key");
    const config = {
      ...configWithoutCloudflareBootstrapSecrets,
      authCaptchaEnabled: true,
      authCaptchaSiteVerifyUrlOverride: "http://127.0.0.1:8787/siteverify",
      authCaptchaTurnstileSecretKey: turnstileSecretKey,
      authCaptchaTurnstileSiteKey: "turnstile-site-key",
    };

    const domainEnv = makeDomainWorkerConfiguredEnv({
      agentInternalSecret,
      betterAuthSecret,
      config,
    });
    const appEnv = makeAppWorkerEnv({
      agentOrigin: "https://agent.example.com",
      apiOrigin: "https://api.example.com",
      config,
      syncOrigin: "https://sync.example.com",
    });

    expect(domainEnv).toMatchObject({
      AUTH_CAPTCHA_ENABLED: "true",
      AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE: "http://127.0.0.1:8787/siteverify",
      AUTH_CAPTCHA_TURNSTILE_SECRET_KEY: turnstileSecretKey,
    });
    expect(appEnv).toMatchObject({
      VITE_AUTH_CAPTCHA_ENABLED: "true",
      VITE_AUTH_CAPTCHA_TURNSTILE_SITE_KEY: "turnstile-site-key",
    });
    expect(appEnv).not.toHaveProperty("AUTH_CAPTCHA_TURNSTILE_SECRET_KEY");
    expect(appEnv).not.toHaveProperty("VITE_AUTH_CAPTCHA_TURNSTILE_SECRET_KEY");
  });

  it("passes configured Better Auth rotation secrets through to domain Workers", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");
    const betterAuthSecrets = Redacted.make(
      "2:current-secret-value-0123456789abcdef,1:previous-secret-value-0123456789abcdef"
    );
    const agentInternalSecret = Redacted.make("agent-secret");

    const domainEnv = makeDomainWorkerConfiguredEnv({
      agentInternalSecret,
      betterAuthSecret,
      betterAuthSecrets,
      config: configWithoutCloudflareBootstrapSecrets,
    });

    expect(domainEnv.BETTER_AUTH_SECRETS).toBe(betterAuthSecrets);
  });

  it("passes configured MCP authorized app cache settings through to domain Workers", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");
    const agentInternalSecret = Redacted.make("agent-secret");

    expect(
      makeDomainWorkerConfiguredEnv({
        agentInternalSecret,
        betterAuthSecret,
        config: {
          ...configWithoutCloudflareBootstrapSecrets,
          mcpAuthorizedAppCacheMaxEntries: 32,
          mcpAuthorizedAppCacheTtlSeconds: 45,
        },
      })
    ).toMatchObject({
      MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES: "32",
      MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS: "45",
    });
  });

  it("derives app API origins from the API Worker domain output", () => {
    expect(
      makeCloudflareWorkerOrigin({
        domains: [
          {
            hostname: "api.stage.example.com",
            id: "api-domain-id",
            zoneId: "zone-id",
          },
        ],
        fallbackHostname: "api.example.com",
      })
    ).toBe("https://api.stage.example.com");
    expect(
      makeCloudflareWorkerOrigin({
        domains: ["https://api.stage.example.com"],
        fallbackHostname: "api.example.com",
      })
    ).toBe("https://api.stage.example.com");
    expect(
      makeCloudflareWorkerOrigin({
        domains: [],
        fallbackHostname: "api.example.com",
      })
    ).toBe("https://api.example.com");
    expect(
      makeCloudflareWorkerOrigin({
        domains: [{ hostname: "api.stage.example.com" }],
        fallbackHostname: "api.example.com",
        localDev: true,
        localUrl: "http://localhost:1340",
      })
    ).toBe("http://localhost:1340");
    expect(
      makeCloudflareWorkerOrigin({
        domains: [{ hostname: "api.stage.example.com" }],
        fallbackHostname: "api.example.com",
        localDev: true,
        localUrl: undefined,
      })
    ).toBe("https://api.stage.example.com");

    expect(
      makeAppWorkerEnv({
        agentOrigin: "https://agent.stage.example.com",
        apiOrigin: "https://api.stage.example.com",
        config: configWithoutCloudflareBootstrapSecrets,
        syncOrigin: "https://sync.stage.example.com",
      })
    ).toStrictEqual({
      AGENT_ORIGIN: "https://agent.stage.example.com",
      API_ORIGIN: "https://api.stage.example.com",
      CEIRD_CLOUDFLARE: "1",
      SYNC_ORIGIN: "https://sync.stage.example.com",
      SYSTEM_APP_ORIGIN: "https://app.example.com",
      TENANT_BASE_DOMAIN: "example.com",
      TENANT_HOST_MODE: "stage",
      TENANT_RESERVED_HOSTNAMES:
        "app.example.com,api.example.com,agent.example.com,mcp.example.com,sync.example.com",
      TENANT_STAGE_ALIAS: "main",
      VITE_AGENT_ORIGIN: "https://agent.stage.example.com",
      VITE_API_ORIGIN: "https://api.stage.example.com",
      VITE_SYNC_ORIGIN: "https://sync.stage.example.com",
      VITE_SYSTEM_APP_ORIGIN: "https://app.example.com",
      VITE_TENANT_BASE_DOMAIN: "example.com",
      VITE_TENANT_HOST_MODE: "stage",
      VITE_TENANT_RESERVED_HOSTNAMES:
        "app.example.com,api.example.com,agent.example.com,mcp.example.com,sync.example.com",
      VITE_TENANT_STAGE_ALIAS: "main",
    });
  });

  it("derives stage-scoped Portless local Worker origins", () => {
    expect(
      makePortlessLocalWorkerOrigin({
        stage: "codex/Portless Local Origins",
        worker: "app",
      })
    ).toBe("https://app.codex-portless-local-origins.ceird.localhost");
    expect(
      makeLocalWorkerOrigins({
        env: {
          CEIRD_LOCAL_APP_ORIGIN: "http://app.custom.ceird.localhost:1355",
        },
        stage: "codex-portless-local-origins",
      }).app
    ).toBe("http://app.custom.ceird.localhost:1355");
  });

  it("declares private domain and public adapter Worker env bindings", () => {
    const authEmailQueue = {
      accountId: "account-id",
      queueId: "queue-id",
      queueName: "ceird-test-auth-email",
    } as unknown as Cloudflare.Queue;
    const hyperdrive = {
      accountId: "account-id",
      hyperdriveId: "hyperdrive-id",
      name: "ceird-test-postgres",
    } as unknown as Cloudflare.Hyperdrive;
    const domain = {
      workerName: "ceird-test-domain",
    } as unknown as DomainWorkerResource;
    const aiGateway = {
      gatewayId: "ceird-main-agent-ai",
    } as unknown as Cloudflare.AiGateway;
    const electricSourceSecret = Redacted.make("electric-secret");

    const domainResourceEnv = makeDomainWorkerResourceEnv({
      analytics: workerAnalytics,
      authEmailQueue,
      config: configWithoutCloudflareBootstrapSecrets,
      hyperdrive,
    });
    const domainWorkerProps = makeDomainWorkerProps({
      agentInternalSecret: Redacted.make("agent-secret"),
      analytics: workerAnalytics,
      authEmailQueue,
      betterAuthSecret: Redacted.make("better-auth-secret"),
      config: configWithoutCloudflareBootstrapSecrets,
      hyperdrive,
      name: "ceird-main-domain",
    });
    const apiResourceEnv = makeApiWorkerResourceEnv({
      analytics: workerAnalytics,
      domain,
    });
    const apiWorkerProps = makeApiWorkerProps({
      analytics: workerAnalytics,
      config: configWithoutCloudflareBootstrapSecrets,
      domain,
      hostname: "api.example.com",
      name: "ceird-main-api",
    });
    const mcpResourceEnv = makeMcpWorkerResourceEnv({
      analytics: workerAnalytics,
      domain,
    });
    const agentResourceEnv = makeAgentWorkerResourceEnv({
      aiGateway,
      analytics: workerAnalytics,
      domain,
    });
    const syncResourceEnv = makeSyncWorkerResourceEnv({
      analytics: workerAnalytics,
      domain,
    });
    const electricContainerEnv = makeElectricContainerEnv({
      databaseUrl: Redacted.make("postgres://electric.example/db"),
      electricSecret: electricSourceSecret,
      storage: {
        accessKeyId: Redacted.make("r2-access-key-id"),
        accountId: "cloudflare-account-id",
        bucketName: "ceird-main-electric-storage",
        awsSecretAccessKey: Redacted.make("r2-secret-access-key"),
      },
    });
    const syncWorkerProps = makeSyncWorkerProps({
      analytics: workerAnalytics,
      config: configWithoutCloudflareBootstrapSecrets,
      domain,
      electricContainer: {
        env: electricContainerEnv,
        name: "ceird-main-electric",
      },
      electricSqlLocationHint: "weur",
      electricSourceSecret,
      hostname: "sync.example.com",
      name: "ceird-main-sync",
    });
    const electricContainerProps = makeElectricContainerProps({
      config: configWithoutCloudflareBootstrapSecrets,
      name: "ceird-main-electric",
    });
    assertDeployedDomainWorkerResourceEnv(domainResourceEnv);
    assertDeployedDomainWorkerEnv(domainWorkerProps.env);
    const authEmailBinding = domainResourceEnv.AUTH_EMAIL;
    const authEmail = isInputEffect(authEmailBinding)
      ? Effect.runSync(authEmailBinding)
      : authEmailBinding;

    expect(Object.keys(domainResourceEnv)).toStrictEqual([
      ...domainWorkerBindingKeys,
    ]);
    expect(Object.keys(apiResourceEnv)).toStrictEqual([
      ...apiWorkerBindingKeys,
    ]);
    expect(Object.keys(mcpResourceEnv)).toStrictEqual([
      ...mcpWorkerBindingKeys,
    ]);
    expect(Object.keys(syncResourceEnv)).toStrictEqual([
      ...syncWorkerBindingKeys,
    ]);
    expect(Object.keys(agentResourceEnv)).toStrictEqual([
      ...agentWorkerResourceBindingKeys,
    ]);
    expect(domainWorkerBindingKeysMatchRuntimeContract).toBeTruthy();
    expect(domainWorkerEnvSatisfiesRuntimeContract).toBeTruthy();
    expect(domainWorkerRuntimeContractSatisfiesEnv).toBeTruthy();
    expect(apiWorkerBindingKeysMatchRuntimeContract).toBeTruthy();
    expect(apiWorkerEnvSatisfiesRuntimeContract).toBeTruthy();
    expect(apiWorkerRuntimeContractSatisfiesEnv).toBeTruthy();
    expect(mcpWorkerBindingKeysMatchRuntimeContract).toBeTruthy();
    expect(mcpWorkerEnvSatisfiesRuntimeContract).toBeTruthy();
    expect(mcpWorkerRuntimeContractSatisfiesEnv).toBeTruthy();
    expect(agentWorkerBindingKeysMatchRuntimeContract).toBeTruthy();
    expect(agentWorkerEnvSatisfiesRuntimeContract).toBeTruthy();
    expect(agentWorkerRuntimeContractSatisfiesEnv).toBeTruthy();
    expect(syncWorkerBindingKeysMatchRuntimeContract).toBeTruthy();
    expect(syncWorkerEnvSatisfiesRuntimeContract).toBeTruthy();
    expect(syncWorkerRuntimeContractSatisfiesEnv).toBeTruthy();
    expect(domainResourceEnv.AUTH_EMAIL_QUEUE).toBe(authEmailQueue);
    expect(domainResourceEnv.ANALYTICS).toBe(workerAnalytics);
    expect(domainResourceEnv.DATABASE).toBe(hyperdrive);
    expect(apiResourceEnv.ANALYTICS).toBe(workerAnalytics);
    expect(apiResourceEnv.DOMAIN).toBe(domain);
    expect(mcpResourceEnv.ANALYTICS).toBe(workerAnalytics);
    expect(mcpResourceEnv.DOMAIN).toBe(domain);
    expect(agentResourceEnv.AI).toBe(aiGateway);
    expect(agentResourceEnv.ANALYTICS).toBe(workerAnalytics);
    expect(agentResourceEnv.DOMAIN).toBe(domain);
    expect(syncResourceEnv.ANALYTICS).toBe(workerAnalytics);
    expect(syncResourceEnv.DOMAIN).toBe(domain);
    expect(domainWorkerProps.compatibility).toBe(ceirdWorkerCompatibility);
    expect(domainWorkerProps.crons).toStrictEqual(["17 3 * * *"]);
    expect(domainWorkerProps.observability).toBe(ceirdWorkerObservability);
    expect(domainWorkerProps.placement).toBe(ceirdDomainWorkerPlacement);
    expect(apiWorkerProps.compatibility).toBe(ceirdWorkerCompatibility);
    expect(apiWorkerProps.observability).toBe(ceirdWorkerObservability);
    expect(syncWorkerProps.compatibility).toBe(ceirdWorkerCompatibility);
    expect(syncWorkerProps.observability).toMatchObject({
      logs: {
        enabled: true,
        invocationLogs: false,
      },
      traces: {
        enabled: true,
      },
    });
    expect(domainWorkerProps).not.toHaveProperty("domain");
    expect(domainWorkerProps.main).toContain("/apps/domain/src/worker.ts");
    expect(domainWorkerProps.url).toBeFalsy();
    expect(domainWorkerProps.env.ANALYTICS).toBe(workerAnalytics);
    expect(domainWorkerProps.env.AUTH_EMAIL_QUEUE).toBe(authEmailQueue);
    expect(domainWorkerProps.env.DATABASE).toBe(hyperdrive);
    expect(apiWorkerProps).toMatchObject({
      domain: "api.example.com",
      env: {
        ANALYTICS: workerAnalytics,
        CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
        DOMAIN: domain,
        NODE_ENV: "production",
      },
      name: "ceird-main-api",
      url: true,
    });
    expect(apiWorkerProps.main).toContain("/apps/api/src/worker.ts");
    expect(syncWorkerProps).toMatchObject({
      domain: "sync.example.com",
      env: {
        ANALYTICS: workerAnalytics,
        AUTH_APP_ORIGIN: "https://app.example.com",
        AUTH_TRUSTED_ORIGINS:
          "https://app.example.com,https://*--main.example.com",
        CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
        DOMAIN: domain,
        ELECTRIC_CONTAINER_AWS_ACCESS_KEY_ID:
          electricContainerEnv.AWS_ACCESS_KEY_ID,
        ELECTRIC_CONTAINER_AWS_SECRET_ACCESS_KEY:
          electricContainerEnv.AWS_SECRET_ACCESS_KEY,
        ELECTRIC_CONTAINER_DATABASE_URL: electricContainerEnv.DATABASE_URL,
        ELECTRIC_CONTAINER_ELECTRIC_SECRET:
          electricContainerEnv.ELECTRIC_SECRET,
        ELECTRIC_CONTAINER_R2_ACCOUNT_ID: "cloudflare-account-id",
        ELECTRIC_CONTAINER_R2_BUCKET_NAME: "ceird-main-electric-storage",
        ELECTRIC_SQL_LOCATION_HINT: "weur",
        ELECTRIC_SOURCE_SECRET: electricSourceSecret,
        NODE_ENV: "production",
      },
      name: "ceird-main-sync",
      url: false,
    });
    expect(syncWorkerProps.main).toContain("/apps/sync/src/worker.ts");
    expect(syncWorkerProps.env.ElectricSql).toMatchObject({
      className: "ElectricSql",
    });
    expect(electricContainerEnv).toMatchObject({
      CEIRD_ELECTRIC_STORAGE_BACKEND: "r2",
      CEIRD_ELECTRIC_STORAGE_MOUNT: "/var/lib/electric",
      ELECTRIC_INSECURE: "false",
      ELECTRIC_LOG_LEVEL: "info",
      ELECTRIC_PERSISTENT_STATE: "file",
      ELECTRIC_PORT: "3000",
      ELECTRIC_SHAPE_DB_EXCLUSIVE_MODE: "true",
      ELECTRIC_STORAGE: "fast_file",
      ELECTRIC_STORAGE_DIR: "/var/lib/electric",
      R2_ACCOUNT_ID: "cloudflare-account-id",
      R2_BUCKET_NAME: "ceird-main-electric-storage",
    });
    expect(
      Redacted.value(
        electricContainerEnv.AWS_ACCESS_KEY_ID as Redacted.Redacted<string>
      )
    ).toBe("r2-access-key-id");
    expect(
      Redacted.value(
        electricContainerEnv.AWS_SECRET_ACCESS_KEY as Redacted.Redacted<string>
      )
    ).toBe("r2-secret-access-key");
    expect(
      Redacted.value(
        electricContainerEnv.DATABASE_URL as Redacted.Redacted<string>
      )
    ).toBe("postgres://electric.example/db");
    expect(
      Redacted.value(
        electricContainerEnv.ELECTRIC_SECRET as Redacted.Redacted<string>
      )
    ).toBe("electric-secret");
    expect(
      makeCloudflareR2BucketResourceKey({
        accountId: "cloudflare-account-id",
        bucketName: "ceird-main-electric-storage",
        jurisdiction: "default",
      })
    ).toBe(
      "com.cloudflare.edge.r2.bucket.cloudflare-account-id_default_ceird-main-electric-storage"
    );
    expect(makeR2SecretAccessKey(Redacted.make("r2-api-token"))).toBe(
      "aa5f2214de84af13e0c69fa550e9c92fa4a5ca10d115fdd708acf64f9b4ff0ac"
    );
    expect(makeDurableObjectLocationHintForNeonRegion("aws-eu-west-2")).toBe(
      "weur"
    );
    expect(makeDurableObjectLocationHintForNeonRegion("aws-us-east-1")).toBe(
      "enam"
    );
    expect(makeDurableObjectLocationHintForNeonRegion("aws-us-west-2")).toBe(
      "wnam"
    );
    expect(makeDurableObjectLocationHintForNeonRegion("aws-sa-east-1")).toBe(
      "sam"
    );
    expect(
      makeDurableObjectLocationHintForNeonRegion("aws-ap-southeast-1")
    ).toBe("apac");
    expect(electricContainerProps).toMatchObject({
      autoInstallExternals: false,
      isExternal: true,
      instanceType: "basic",
      instances: 1,
      maxInstances: 1,
      name: "ceird-main-electric",
      ports: [{ name: "http", port: 3000 }],
      runtime: "node",
    });
    expect(electricContainerProps.main).toContain(
      "/apps/sync/src/platform/cloudflare/electric-container-runtime.ts"
    );
    expect(electricContainerProps).not.toHaveProperty("checks");
    expect(electricContainerDockerfile).toContain(
      "FROM --platform=linux/amd64 golang:1.25-bookworm AS tigrisfs-build"
    );
    const tigrisfsVersionReference = `$${"{TIGRISFS_VERSION}"}`;
    expect(electricContainerDockerfile).toContain(
      `git clone --depth=1 --branch v${tigrisfsVersionReference} https://github.com/tigrisdata/tigrisfs.git`
    );
    expect(electricContainerDockerfile).toContain(
      "GOBIN=/out /usr/local/go/bin/go install ."
    );
    expect(electricContainerDockerfile).toContain("TIGRISFS_VERSION");
    expect(electricContainerDockerfile).not.toContain("curl");
    expect(electricContainerDockerfile).not.toContain(
      "github.com/tigrisdata/tigrisfs/releases/download"
    );
    expect(electricContainerProps).not.toHaveProperty("environmentVariables");
    expect(electricContainerProps).not.toHaveProperty("secrets");
    expect(Cloudflare.isSendEmail(authEmail)).toBeTruthy();
    expect(authEmail).toMatchObject({
      allowedSenderAddresses: ["no-reply@example.com"],
      name: "AuthEmailBinding",
    });
  });

  it("omits provider bindings unsupported by local Alchemy dev", () => {
    const authEmailQueue = {
      accountId: "account-id",
      queueId: "queue-id",
      queueName: "ceird-test-auth-email",
    } as unknown as Cloudflare.Queue;
    const hyperdrive = {
      accountId: "account-id",
      hyperdriveId: "hyperdrive-id",
      name: "ceird-test-postgres",
    } as unknown as Cloudflare.Hyperdrive;
    const domain = {
      workerName: "ceird-test-domain",
    } as unknown as DomainWorkerResource;
    const aiGateway = {
      gatewayId: "ceird-main-agent-ai",
    } as unknown as Cloudflare.AiGateway;
    const localOrigins = makeLocalWorkerOrigins({
      stage: "codex-portless-local-origins",
    });

    const domainResourceEnv = makeDomainWorkerResourceEnv({
      analytics: workerAnalytics,
      authEmailQueue,
      config: configWithoutCloudflareBootstrapSecrets,
      hyperdrive,
      localDev: true,
    });
    const domainWorkerProps = makeDomainWorkerProps({
      agentInternalSecret: Redacted.make("agent-secret"),
      analytics: workerAnalytics,
      authEmailQueue,
      betterAuthSecret: Redacted.make("better-auth-secret"),
      config: configWithoutCloudflareBootstrapSecrets,
      hyperdrive,
      localDev: true,
      localOrigins: {
        app: localOrigins.app,
        api: localOrigins.api,
        mcp: localOrigins.mcp,
      },
      name: "ceird-main-domain",
    });
    const agentWorkerProps = makeAgentWorkerProps({
      agentInternalSecret: Redacted.make("agent-secret"),
      aiGateway,
      analytics: workerAnalytics,
      config: configWithoutCloudflareBootstrapSecrets,
      domain,
      hostname: "agent.example.com",
      localAppOrigin: localOrigins.app,
      localDev: true,
      name: "ceird-main-agent",
    });
    const apiWorkerProps = makeApiWorkerProps({
      analytics: workerAnalytics,
      config: configWithoutCloudflareBootstrapSecrets,
      domain,
      hostname: "api.example.com",
      localDev: true,
      name: "ceird-main-api",
    });
    const mcpWorkerProps = makeMcpWorkerProps({
      analytics: workerAnalytics,
      config: configWithoutCloudflareBootstrapSecrets,
      domain,
      hostname: "mcp.example.com",
      localDev: true,
      name: "ceird-main-mcp",
    });
    const syncWorkerProps = makeSyncWorkerProps({
      analytics: workerAnalytics,
      config: configWithoutCloudflareBootstrapSecrets,
      domain,
      electricSqlLocationHint: "weur",
      electricSourceSecret: Redacted.make("electric-secret"),
      hostname: "sync.example.com",
      localDev: true,
      localAppOrigin: localOrigins.app,
      name: "ceird-main-sync",
    });
    const appEnv = makeAppWorkerEnv({
      agentOrigin: localOrigins.agent,
      apiOrigin: localOrigins.api,
      config: configWithoutCloudflareBootstrapSecrets,
      localAppOrigin: localOrigins.app,
      localDev: true,
      syncOrigin: localOrigins.sync,
    });
    assertLocalDomainWorkerEnv(domainWorkerProps.env);

    expect(Object.keys(domainResourceEnv)).toStrictEqual(["DATABASE"]);
    expect(domainWorkerProps.env).not.toHaveProperty("ANALYTICS");
    expect(domainWorkerProps.env).not.toHaveProperty("AUTH_EMAIL");
    expect(domainWorkerProps.env).not.toHaveProperty("AUTH_EMAIL_QUEUE");
    expect(domainWorkerProps.env.DATABASE).toBe(hyperdrive);
    expect(domainWorkerProps.env).not.toHaveProperty("DATABASE_URL");
    expect(agentWorkerProps.env).not.toHaveProperty("ANALYTICS");
    expect(apiWorkerProps.env).not.toHaveProperty("ANALYTICS");
    expect(mcpWorkerProps.env).not.toHaveProperty("ANALYTICS");
    expect(syncWorkerProps.env).not.toHaveProperty("ANALYTICS");
    expect(syncWorkerProps.env).not.toHaveProperty(
      "ELECTRIC_CONTAINER_DATABASE_URL"
    );
    expect(syncWorkerProps.env).not.toHaveProperty(
      "ELECTRIC_CONTAINER_R2_BUCKET_NAME"
    );
    expect(domainWorkerProps.env.CEIRD_LOCAL_DEV).toBe("true");
    expect(domainWorkerProps.env.AUTH_RATE_LIMIT_CLEANUP_ENABLED).toBe("false");
    expect(domainWorkerProps.env.AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE).toBe(
      "1000"
    );
    expect(domainWorkerProps.env.AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES).toBe(
      "10"
    );
    expect(domainWorkerProps.env.AUTH_RATE_LIMIT_RETENTION_HOURS).toBe("48");
    expect(domainWorkerProps.crons).toStrictEqual([]);
    expect(domainWorkerProps.env.AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED).toBe(
      "false"
    );
    expect(domainWorkerProps.env.AUTH_APP_ORIGIN).toBe(
      "https://app.codex-portless-local-origins.ceird.localhost"
    );
    expect(domainWorkerProps.env.AUTH_COOKIE_DOMAIN).toBeUndefined();
    expect(domainWorkerProps.env.AUTH_TRUSTED_ORIGINS).toBe(
      "https://app.codex-portless-local-origins.ceird.localhost"
    );
    expect(domainWorkerProps.env.BETTER_AUTH_BASE_URL).toBe(
      "https://api.codex-portless-local-origins.ceird.localhost/api/auth"
    );
    expect(domainWorkerProps.env.MCP_RESOURCE_URL).toBe(
      "https://mcp.codex-portless-local-origins.ceird.localhost/mcp"
    );
    expect(agentWorkerProps.env).toMatchObject({
      AGENT_AI_GATEWAY_ID: aiGateway.gatewayId,
      AGENT_INTERNAL_SECRET: expect.any(Object),
      AUTH_APP_ORIGIN:
        "https://app.codex-portless-local-origins.ceird.localhost",
      AUTH_TRUSTED_ORIGINS:
        "https://app.codex-portless-local-origins.ceird.localhost",
      CEIRD_LOCAL_DEV: "true",
      CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
      NODE_ENV: "production",
    });
    expect(agentWorkerProps.env).not.toHaveProperty(
      "AGENT_MUTATION_TOOLS_ENABLED"
    );
    expect(agentWorkerProps.env.AI).toBe(aiGateway);
    expect(agentWorkerProps.env.DOMAIN).toBe(domain);
    expect(agentWorkerProps.env.CeirdAgent).toMatchObject({
      className: "CeirdAgent",
    });
    expect(appEnv).toStrictEqual({
      AGENT_ORIGIN:
        "https://agent.codex-portless-local-origins.ceird.localhost",
      API_ORIGIN: "https://api.codex-portless-local-origins.ceird.localhost",
      CEIRD_CLOUDFLARE: "1",
      CEIRD_LOCAL_DEV: "true",
      SYNC_ORIGIN: "https://sync.codex-portless-local-origins.ceird.localhost",
      SYSTEM_APP_ORIGIN:
        "https://app.codex-portless-local-origins.ceird.localhost",
      TENANT_BASE_DOMAIN: "example.com",
      TENANT_HOST_MODE: "disabled",
      TENANT_RESERVED_HOSTNAMES: "",
      VITE_AGENT_ORIGIN:
        "https://agent.codex-portless-local-origins.ceird.localhost",
      VITE_API_ORIGIN:
        "https://api.codex-portless-local-origins.ceird.localhost",
      VITE_SYNC_ORIGIN:
        "https://sync.codex-portless-local-origins.ceird.localhost",
      VITE_SYSTEM_APP_ORIGIN:
        "https://app.codex-portless-local-origins.ceird.localhost",
      VITE_TENANT_BASE_DOMAIN: "example.com",
      VITE_TENANT_HOST_MODE: "disabled",
      VITE_TENANT_RESERVED_HOSTNAMES: "",
    });
  });

  it("preserves already-redacted local database URLs without nesting the secret wrapper", async () => {
    const databaseUrl = "postgresql://ceird:secret@example.neon.tech/ceird";
    const alreadyRedactedDatabaseUrl = Output.asOutput(
      Redacted.make(databaseUrl)
    ) as Output.Output<Redacted.Redacted<string>, never>;
    const redactedDatabaseUrl = redactInput(alreadyRedactedDatabaseUrl);

    if (!Output.isOutput(redactedDatabaseUrl)) {
      throw new Error("Expected local database URL helper to preserve Output");
    }

    const resolvedDatabaseUrl = await Effect.runPromise(
      Output.evaluate(redactedDatabaseUrl, {}).pipe(
        Effect.provide(State.inMemoryState())
      )
    );

    if (!Redacted.isRedacted(resolvedDatabaseUrl)) {
      throw new Error("Expected local database URL output to stay redacted");
    }

    expect(Redacted.value(resolvedDatabaseUrl)).toBe(databaseUrl);
    expect(
      Redacted.isRedacted(Redacted.value(resolvedDatabaseUrl))
    ).toBeFalsy();
  });

  it("rebuilds serialized redacted marker outputs into live secrets", async () => {
    const databaseUrl = "postgresql://ceird:secret@example.neon.tech/ceird";
    const serializedRedactedDatabaseUrl = Output.asOutput({
      _tag: "Redacted",
      value: databaseUrl,
    } as unknown as Redacted.Redacted<string>) as Output.Output<
      Redacted.Redacted<string>,
      never
    >;
    const redactedDatabaseUrl = redactInput(serializedRedactedDatabaseUrl);

    if (!Output.isOutput(redactedDatabaseUrl)) {
      throw new Error(
        "Expected serialized redacted marker helper to preserve Output"
      );
    }

    const resolvedDatabaseUrl = await Effect.runPromise(
      Output.evaluate(redactedDatabaseUrl, {}).pipe(
        Effect.provide(State.inMemoryState())
      )
    );

    if (!Redacted.isRedacted(resolvedDatabaseUrl)) {
      throw new Error(
        "Expected serialized redacted marker output to rebuild a Redacted secret"
      );
    }

    expect(Redacted.value(resolvedDatabaseUrl)).toBe(databaseUrl);
  });

  it("declares the Agent Worker as a public observed Cloudflare Agent over the domain service", () => {
    const domain = {
      workerName: "ceird-test-domain",
    } as unknown as DomainWorkerResource;
    const aiGateway = {
      gatewayId: "ceird-main-agent-ai",
    } as unknown as Cloudflare.AiGateway;
    const agentInternalSecret = Redacted.make("agent-secret");
    const aiGatewayProps = makeAgentAiGatewayProps({
      config: configWithoutCloudflareBootstrapSecrets,
    });
    const agentWorkerProps = makeAgentWorkerProps({
      agentInternalSecret,
      aiGateway,
      analytics: workerAnalytics,
      config: configWithoutCloudflareBootstrapSecrets,
      domain,
      hostname: "agent.example.com",
      name: "ceird-main-agent",
    });

    expect(agentWorkerProps).toMatchObject({
      domain: "agent.example.com",
      env: {
        AGENT_AI_GATEWAY_ID: aiGateway.gatewayId,
        AGENT_INTERNAL_SECRET: agentInternalSecret,
        AUTH_APP_ORIGIN: "https://app.example.com",
        AUTH_TRUSTED_ORIGINS:
          "https://app.example.com,https://*--main.example.com",
        CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
        NODE_ENV: "production",
      },
      name: "ceird-main-agent",
      url: false,
    });
    expect(agentWorkerProps.env).not.toHaveProperty(
      "AGENT_MUTATION_TOOLS_ENABLED"
    );
    expect(agentWorkerProps.compatibility).toBe(ceirdWorkerCompatibility);
    expect(agentWorkerProps.observability).toMatchObject({
      enabled: true,
      logs: {
        enabled: true,
        headSamplingRate: 0.1,
        invocationLogs: false,
      },
      traces: {
        enabled: true,
        headSamplingRate: 0.1,
      },
    });
    expect(agentWorkerProps.main).toContain("/apps/agent/src/worker.ts");
    expect(aiGatewayProps).toStrictEqual({
      authentication: true,
      cacheTtl: null,
      collectLogs: false,
      id: "ceird-main-agent-ai",
      rateLimitingInterval: null,
      rateLimitingLimit: null,
    });
    expect(agentWorkerProps.env.AI).toBe(aiGateway);
    expect(agentWorkerProps.env.ANALYTICS).toBe(workerAnalytics);
    expect(agentWorkerProps.env.DOMAIN).toBe(domain);
    expect(agentWorkerProps.env.CeirdAgent).toMatchObject({
      className: "CeirdAgent",
    });
  });

  it("declares the MCP Worker as a public observed adapter over the domain service", () => {
    const domain = {
      workerName: "ceird-test-domain",
    } as unknown as DomainWorkerResource;

    const mcpWorkerProps = makeMcpWorkerProps({
      analytics: workerAnalytics,
      config: configWithoutCloudflareBootstrapSecrets,
      domain,
      hostname: "mcp.example.com",
      name: "ceird-main-mcp",
    });

    expect(mcpWorkerProps).toMatchObject({
      domain: "mcp.example.com",
      env: {
        CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
        NODE_ENV: "production",
      },
      name: "ceird-main-mcp",
      observability: {
        enabled: true,
        logs: {
          enabled: true,
          headSamplingRate: 0.1,
          invocationLogs: true,
        },
        traces: {
          enabled: true,
          headSamplingRate: 0.1,
        },
      },
      url: false,
    });
    expect(mcpWorkerProps.compatibility).toBe(ceirdWorkerCompatibility);
    expect(mcpWorkerProps.observability).toBe(ceirdWorkerObservability);
    expect(mcpWorkerProps.main).toContain("/apps/mcp/src/worker.ts");
    expect(mcpWorkerProps.env.ANALYTICS).toBe(workerAnalytics);
    expect(mcpWorkerProps.env.DOMAIN).toBe(domain);
  });

  it("uses the configured Hyperdrive name instead of deriving a fresh provider name", () => {
    expect(
      makeCloudflareHyperdriveProps({
        config: configWithoutCloudflareBootstrapSecrets,
        origin: {
          database: "ceird",
          host: "db.example.com",
          password: Redacted.make("secret"),
          scheme: "postgresql",
          user: "ceird",
        },
      })
    ).toMatchObject({
      name: "ceird-production-postgres",
      originConnectionLimit: 5,
      caching: { disabled: true },
    });
  });

  it("keeps configured Worker env declarations aligned with runtime contracts", () => {
    expect(apiWorkerConfiguredEnvKeysMatchRuntimeConfig).toBeTruthy();
    expect(domainWorkerConfiguredEnvKeysMatchRuntimeConfig).toBeTruthy();
    expect(mcpWorkerConfiguredEnvKeysMatchRuntimeConfig).toBeTruthy();
    expect(agentWorkerConfiguredEnvKeysMatchRuntimeConfig).toBeTruthy();
    expect(syncWorkerConfiguredEnvKeysMatchRuntimeConfig).toBeTruthy();
    expect(domainWorkerConfiguredStringValuesSatisfyRuntimeConfig).toBeTruthy();
    expect(apiWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBeTruthy();
    expect(domainWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBeTruthy();
    expect(mcpWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBeTruthy();
    expect(agentWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBeTruthy();
    expect(syncWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBeTruthy();
    expect(appWorkerEnvKeysMatchAppContract).toBeTruthy();
    expect(appWorkerRuntimeEnvSatisfiesAppContract).toBeTruthy();
    expect(appContractSatisfiesStackEnv).toBeTruthy();
    expect(appWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBeTruthy();
    expect(cloudflareStackOutputsIncludeCanonicalOrigins).toBeTruthy();
    expect(cloudflareStackOutputsIncludeElectricStorage).toBeTruthy();
    expect(cloudflareStackOutputsIncludeTenantRouting).toBeTruthy();
  });
});
