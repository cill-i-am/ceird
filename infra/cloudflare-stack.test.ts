import { describe, expect, it } from "@effect/vitest";
import * as Cloudflare from "alchemy/Cloudflare";
import type { WorkerProps } from "alchemy/Cloudflare";
import type { Input } from "alchemy/Input";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import type {
  AgentWorkerBindingEnv,
  AgentWorkerBindings,
  AgentWorkerConfiguredEnv,
} from "../apps/agent/infra/cloudflare-worker.ts";
import {
  makeAgentAiGatewayProps,
  makeAgentWorkerBindings,
  makeAgentWorkerEnv,
  makeAgentWorkerProps,
} from "../apps/agent/infra/cloudflare-worker.ts";
import type {
  AgentWorkerBindingRuntimeEnv,
  AgentWorkerConfigEnv,
} from "../apps/agent/src/platform/cloudflare/env.ts";
import type { ApiWorkerConfiguredEnv } from "../apps/api/infra/cloudflare-worker.ts";
import {
  makeApiWorkerBindings,
  makeApiWorkerEnv,
  makeApiWorkerProps,
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
  DomainWorkerBindings,
  DomainWorkerConfiguredEnv,
} from "../apps/domain/infra/cloudflare-worker.ts";
import {
  makeDomainWorkerBindings,
  makeDomainWorkerEnv,
  makeDomainWorkerProps,
} from "../apps/domain/infra/cloudflare-worker.ts";
import type {
  DomainWorkerBindingRuntimeEnv,
  DomainWorkerConfigEnv,
} from "../apps/domain/src/platform/cloudflare/env.ts";
import type { McpWorkerConfiguredEnv } from "../apps/mcp/infra/cloudflare-worker.ts";
import {
  makeMcpWorkerBindings,
  makeMcpWorkerEnv,
  makeMcpWorkerProps,
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
  makeSyncWorkerBindings,
  makeSyncWorkerEnv,
  makeSyncWorkerProps,
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
  makeAlchemyLocalWorkerOrigin,
  makeCloudflareHyperdriveProps,
  makeDurableObjectLocationHintForNeonRegion,
  makeTenantReservedHostBypassRoutePatterns,
  makeCloudflareWorkerOrigin,
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
] as const satisfies readonly (keyof AgentWorkerBindings)[];

const domainWorkerBindingKeysMatchRuntimeContract: AssertTrue<
  HasSameKeys<DomainWorkerBindingEnv, DomainWorkerBindingRuntimeEnv>
> = true;
const domainWorkerBindingsSatisfyRuntimeContract: AssertTrue<
  DomainWorkerBindingEnv extends DomainWorkerBindingRuntimeEnv ? true : false
> = true;
const domainWorkerRuntimeContractSatisfiesBindings: AssertTrue<
  RequiredNonNullableProperties<DomainWorkerBindingRuntimeEnv> extends DomainWorkerBindingEnv
    ? true
    : false
> = true;

const apiWorkerBindingKeysMatchRuntimeContract: AssertTrue<
  HasSameKeys<ApiWorkerBindingEnv, ApiWorkerBindingRuntimeEnv>
> = true;
const apiWorkerBindingsSatisfyRuntimeContract: AssertTrue<
  ApiWorkerBindingEnv extends ApiWorkerBindingRuntimeEnv ? true : false
> = true;
const apiWorkerRuntimeContractSatisfiesBindings: AssertTrue<
  RequiredNonNullableProperties<ApiWorkerBindingRuntimeEnv> extends ApiWorkerBindingEnv
    ? true
    : false
> = true;
const mcpWorkerBindingKeysMatchRuntimeContract: AssertTrue<
  HasSameKeys<McpWorkerBindingEnv, McpWorkerBindingRuntimeEnv>
> = true;
const mcpWorkerBindingsSatisfyRuntimeContract: AssertTrue<
  McpWorkerBindingEnv extends McpWorkerBindingRuntimeEnv ? true : false
> = true;
const mcpWorkerRuntimeContractSatisfiesBindings: AssertTrue<
  RequiredNonNullableProperties<McpWorkerBindingRuntimeEnv> extends McpWorkerBindingEnv
    ? true
    : false
> = true;
const agentWorkerBindingKeysMatchRuntimeContract: AssertTrue<
  HasSameKeys<AgentWorkerBindingEnv, AgentWorkerBindingRuntimeEnv>
> = true;
const agentWorkerBindingsSatisfyRuntimeContract: AssertTrue<
  AgentWorkerBindingEnv extends AgentWorkerBindingRuntimeEnv ? true : false
> = true;
const agentWorkerRuntimeContractSatisfiesBindings: AssertTrue<
  RequiredNonNullableProperties<AgentWorkerBindingRuntimeEnv> extends AgentWorkerBindingEnv
    ? true
    : false
> = true;
const syncWorkerBindingKeysMatchRuntimeContract: AssertTrue<
  HasSameKeys<SyncWorkerBindingEnv, SyncWorkerBindingRuntimeEnv>
> = true;
const syncWorkerBindingsSatisfyRuntimeContract: AssertTrue<
  SyncWorkerBindingEnv extends SyncWorkerBindingRuntimeEnv ? true : false
> = true;
const syncWorkerRuntimeContractSatisfiesBindings: AssertTrue<
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
    | "AUTH_RATE_LIMIT_ENABLED"
    | "AUTH_TRUSTED_ORIGINS"
    | "BETTER_AUTH_BASE_URL"
    | "BETTER_AUTH_SECRET"
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
    | "AGENT_MUTATION_TOOLS_ENABLED"
    | "AUTH_APP_ORIGIN"
    | "AUTH_TRUSTED_ORIGINS"
    | "CEIRD_WORKER_ANALYTICS_SAMPLE_RATE"
    | "NODE_ENV"
  >
> &
  Pick<AgentWorkerConfigEnv, "CEIRD_LOCAL_DEV">;
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
type WorkerConfiguredEnvValue = Input<WorkerEnvValue>;
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
  AllPropertyValuesExtend<ApiWorkerConfiguredEnv, WorkerConfiguredEnvValue>
> = true;
const domainWorkerConfiguredValuesSatisfyAlchemyWorkerEnv: AssertTrue<
  AllPropertyValuesExtend<DomainWorkerConfiguredEnv, WorkerConfiguredEnvValue>
> = true;
const mcpWorkerConfiguredValuesSatisfyAlchemyWorkerEnv: AssertTrue<
  AllPropertyValuesExtend<McpWorkerConfiguredEnv, WorkerConfiguredEnvValue>
> = true;
const agentWorkerConfiguredValuesSatisfyAlchemyWorkerEnv: AssertTrue<
  AllPropertyValuesExtend<AgentWorkerConfiguredEnv, WorkerConfiguredEnvValue>
> = true;
const syncWorkerConfiguredValuesSatisfyAlchemyWorkerEnv: AssertTrue<
  AllPropertyValuesExtend<SyncWorkerConfiguredEnv, WorkerConfiguredEnvValue>
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
    WorkerConfiguredEnvValue
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
    const apiEnv = makeApiWorkerEnv({
      workerAnalyticsSampleRate:
        configWithoutCloudflareBootstrapSecrets.workerAnalyticsSampleRate,
    });
    const domainEnv = makeDomainWorkerEnv({
      agentInternalSecret,
      betterAuthSecret,
      config: configWithoutCloudflareBootstrapSecrets,
    });
    const mcpEnv = makeMcpWorkerEnv({
      workerAnalyticsSampleRate:
        configWithoutCloudflareBootstrapSecrets.workerAnalyticsSampleRate,
    });
    const agentEnv = makeAgentWorkerEnv({
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
    const syncEnv = makeSyncWorkerEnv({
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
      AGENT_MUTATION_TOOLS_ENABLED: "true",
      AUTH_APP_ORIGIN: "https://app.example.com",
      AUTH_TRUSTED_ORIGINS:
        "https://app.example.com,https://*--main.example.com",
      CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
      NODE_ENV: "production",
    });
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

  it("passes tenant host config to app and auth domain Workers", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");
    const agentInternalSecret = Redacted.make("agent-secret");
    const appEnv = makeAppWorkerEnv({
      agentOrigin: "https://agent.pr-123.example.com",
      apiOrigin: "https://api.pr-123.example.com",
      config: previewTenantConfig,
      syncOrigin: "https://sync.pr-123.example.com",
    });
    const domainEnv = makeDomainWorkerEnv({
      agentInternalSecret,
      betterAuthSecret,
      config: previewTenantConfig,
    });
    const agentEnv = makeAgentWorkerEnv({
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

  it("bootstraps local Electric storage and fails closed for deployed stage credentials", () => {
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
          config: {
            ...previewTenantConfig,
            electricStorageAccessKeyId: Redacted.make("electric-access-key-id"),
            electricStorageSecretAccessKey: Redacted.make(
              "electric-secret-access-key"
            ),
          },
          localDev: false,
        })
      )
    ).toBe(true);
    expect(() =>
      Effect.runSync(
        shouldProvisionElectricStorage({
          config: previewTenantConfig,
          localDev: false,
        })
      )
    ).toThrow(/required outside local Alchemy dev/);
    expect(
      Effect.runSync(
        shouldProvisionElectricStorage({
          config: {
            ...configWithoutCloudflareBootstrapSecrets,
            electricStorageAccessKeyId: Redacted.make("electric-access-key-id"),
            electricStorageSecretAccessKey: Redacted.make(
              "electric-secret-access-key"
            ),
          },
          localDev: false,
        })
      )
    ).toBe(true);
    expect(() =>
      Effect.runSync(
        shouldProvisionElectricStorage({
          config: {
            ...configWithoutCloudflareBootstrapSecrets,
            electricStorageAccessKeyId: Redacted.make("electric-access-key-id"),
          },
          localDev: false,
        })
      )
    ).toThrow(/must be configured together/);
    expect(() =>
      Effect.runSync(
        shouldProvisionElectricStorage({
          config: configWithoutCloudflareBootstrapSecrets,
          localDev: false,
        })
      )
    ).toThrow(/required outside local Alchemy dev/);
  });

  it("sets cross-subdomain auth cookies from the configured tenant base domain", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");
    const agentInternalSecret = Redacted.make("agent-secret");
    const domainEnv = makeDomainWorkerEnv({
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
    const domainEnv = makeDomainWorkerEnv({
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

  it("passes disabled auth rate limits through to preview domain Workers", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");
    const agentInternalSecret = Redacted.make("agent-secret");

    expect(
      makeDomainWorkerEnv({
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
      makeDomainWorkerEnv({
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

    const domainEnv = makeDomainWorkerEnv({
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

    const domainEnv = makeDomainWorkerEnv({
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
      makeDomainWorkerEnv({
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
        domains: [],
        fallbackHostname: "api.example.com",
      })
    ).toBe("https://api.example.com");
    expect(
      makeCloudflareWorkerOrigin({
        domains: [{ hostname: "api.stage.example.com" }],
        fallbackHostname: "api.example.com",
        localDev: true,
        localUrl: "http://api.localhost:1337",
      })
    ).toBe("http://api.localhost:1337");
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

  it("declares private domain and public adapter Worker bindings", () => {
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
    } as unknown as Cloudflare.Worker<DomainWorkerBindings>;
    const aiGateway = {
      gatewayId: "ceird-main-agent-ai",
    } as unknown as Cloudflare.AiGateway;
    const electricSourceSecret = Redacted.make("electric-secret");

    const domainBindings = makeDomainWorkerBindings({
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
    const apiBindings = makeApiWorkerBindings({
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
    const mcpBindings = makeMcpWorkerBindings({
      analytics: workerAnalytics,
      domain,
    });
    const agentBindings = makeAgentWorkerBindings({
      aiGateway,
      analytics: workerAnalytics,
      domain,
    });
    const syncBindings = makeSyncWorkerBindings({
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
    const authEmailBinding = domainBindings.AUTH_EMAIL;

    if (authEmailBinding === undefined) {
      throw new Error("Expected deployed domain Worker auth email binding");
    }

    const authEmail = Effect.isEffect(authEmailBinding)
      ? Effect.runSync(authEmailBinding)
      : authEmailBinding;

    expect(Object.keys(domainBindings)).toStrictEqual([
      ...domainWorkerBindingKeys,
    ]);
    expect(Object.keys(apiBindings)).toStrictEqual([...apiWorkerBindingKeys]);
    expect(Object.keys(mcpBindings)).toStrictEqual([...mcpWorkerBindingKeys]);
    expect(Object.keys(syncBindings)).toStrictEqual([...syncWorkerBindingKeys]);
    expect(Object.keys(agentBindings)).toStrictEqual([
      ...agentWorkerResourceBindingKeys,
    ]);
    expect(domainWorkerBindingKeysMatchRuntimeContract).toBeTruthy();
    expect(domainWorkerBindingsSatisfyRuntimeContract).toBeTruthy();
    expect(domainWorkerRuntimeContractSatisfiesBindings).toBeTruthy();
    expect(apiWorkerBindingKeysMatchRuntimeContract).toBeTruthy();
    expect(apiWorkerBindingsSatisfyRuntimeContract).toBeTruthy();
    expect(apiWorkerRuntimeContractSatisfiesBindings).toBeTruthy();
    expect(mcpWorkerBindingKeysMatchRuntimeContract).toBeTruthy();
    expect(mcpWorkerBindingsSatisfyRuntimeContract).toBeTruthy();
    expect(mcpWorkerRuntimeContractSatisfiesBindings).toBeTruthy();
    expect(agentWorkerBindingKeysMatchRuntimeContract).toBeTruthy();
    expect(agentWorkerBindingsSatisfyRuntimeContract).toBeTruthy();
    expect(agentWorkerRuntimeContractSatisfiesBindings).toBeTruthy();
    expect(syncWorkerBindingKeysMatchRuntimeContract).toBeTruthy();
    expect(syncWorkerBindingsSatisfyRuntimeContract).toBeTruthy();
    expect(syncWorkerRuntimeContractSatisfiesBindings).toBeTruthy();
    expect(domainBindings.AUTH_EMAIL_QUEUE).toBe(authEmailQueue);
    expect(domainBindings.ANALYTICS).toBe(workerAnalytics);
    expect(domainBindings.DATABASE).toBe(hyperdrive);
    expect(apiBindings.ANALYTICS).toBe(workerAnalytics);
    expect(apiBindings.DOMAIN).toBe(domain);
    expect(mcpBindings.ANALYTICS).toBe(workerAnalytics);
    expect(mcpBindings.DOMAIN).toBe(domain);
    expect(agentBindings.AI).toBe(aiGateway);
    expect(agentBindings.ANALYTICS).toBe(workerAnalytics);
    expect(agentBindings.DOMAIN).toBe(domain);
    expect(syncBindings.ANALYTICS).toBe(workerAnalytics);
    expect(syncBindings.DOMAIN).toBe(domain);
    expect(domainWorkerProps.compatibility).toBe(ceirdWorkerCompatibility);
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
    expect(apiWorkerProps).toMatchObject({
      domain: "api.example.com",
      env: {
        CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
        NODE_ENV: "production",
      },
      name: "ceird-main-api",
      url: true,
    });
    expect(apiWorkerProps.main).toContain("/apps/api/src/worker.ts");
    expect(apiWorkerProps.bindings.DOMAIN).toBe(domain);
    expect(syncWorkerProps).toMatchObject({
      domain: "sync.example.com",
      env: {
        AUTH_APP_ORIGIN: "https://app.example.com",
        AUTH_TRUSTED_ORIGINS:
          "https://app.example.com,https://*--main.example.com",
        CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
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
    expect(syncWorkerProps.bindings.DOMAIN).toBe(domain);
    expect(syncWorkerProps.bindings.ElectricSql).toMatchObject({
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
    } as unknown as Cloudflare.Worker<DomainWorkerBindings>;
    const aiGateway = {
      gatewayId: "ceird-main-agent-ai",
    } as unknown as Cloudflare.AiGateway;
    const localOrigins = {
      agent: makeAlchemyLocalWorkerOrigin("agent"),
      api: makeAlchemyLocalWorkerOrigin("api"),
      app: makeAlchemyLocalWorkerOrigin("app"),
      mcp: makeAlchemyLocalWorkerOrigin("mcp"),
      sync: makeAlchemyLocalWorkerOrigin("sync"),
    };

    const domainBindings = makeDomainWorkerBindings({
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
      databaseUrl: Redacted.make(
        "postgresql://ceird:secret@example.neon.tech/ceird"
      ),
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
    const appEnv = makeAppWorkerEnv({
      agentOrigin: localOrigins.agent,
      apiOrigin: localOrigins.api,
      config: configWithoutCloudflareBootstrapSecrets,
      localAppOrigin: localOrigins.app,
      localDev: true,
      syncOrigin: localOrigins.sync,
    });

    expect(Object.keys(domainBindings)).toStrictEqual(["ANALYTICS"]);
    expect(domainWorkerProps.bindings).toStrictEqual(domainBindings);
    expect(domainWorkerProps.bindings.ANALYTICS).toBe(workerAnalytics);
    const localDatabaseUrl = domainWorkerProps.env.DATABASE_URL;

    if (!Redacted.isRedacted(localDatabaseUrl)) {
      throw new Error(
        "Expected local domain Worker DATABASE_URL to be redacted"
      );
    }

    expect(Redacted.value(localDatabaseUrl)).toBe(
      "postgresql://ceird:secret@example.neon.tech/ceird"
    );
    expect(domainWorkerProps.env.CEIRD_LOCAL_DEV).toBe("true");
    expect(domainWorkerProps.env.AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED).toBe(
      "false"
    );
    expect(domainWorkerProps.env.AUTH_APP_ORIGIN).toBe(
      "http://app.localhost:1337"
    );
    expect(domainWorkerProps.env.AUTH_COOKIE_DOMAIN).toBeUndefined();
    expect(domainWorkerProps.env.AUTH_TRUSTED_ORIGINS).toBe(
      "http://app.localhost:1337"
    );
    expect(domainWorkerProps.env.BETTER_AUTH_BASE_URL).toBe(
      "http://api.localhost:1337/api/auth"
    );
    expect(domainWorkerProps.env.MCP_RESOURCE_URL).toBe(
      "http://mcp.localhost:1337/mcp"
    );
    expect(agentWorkerProps.env).toStrictEqual({
      AGENT_AI_GATEWAY_ID: aiGateway.gatewayId,
      AGENT_INTERNAL_SECRET: expect.any(Object),
      AGENT_MUTATION_TOOLS_ENABLED: "true",
      AUTH_APP_ORIGIN: "http://app.localhost:1337",
      AUTH_TRUSTED_ORIGINS: "http://app.localhost:1337",
      CEIRD_LOCAL_DEV: "true",
      CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
      NODE_ENV: "production",
    });
    expect(appEnv).toStrictEqual({
      AGENT_ORIGIN: "http://agent.localhost:1337",
      API_ORIGIN: "http://api.localhost:1337",
      CEIRD_CLOUDFLARE: "1",
      CEIRD_LOCAL_DEV: "true",
      SYNC_ORIGIN: "http://sync.localhost:1337",
      SYSTEM_APP_ORIGIN: "http://app.localhost:1337",
      TENANT_BASE_DOMAIN: "example.com",
      TENANT_HOST_MODE: "disabled",
      TENANT_RESERVED_HOSTNAMES: "",
      VITE_AGENT_ORIGIN: "http://agent.localhost:1337",
      VITE_API_ORIGIN: "http://api.localhost:1337",
      VITE_SYNC_ORIGIN: "http://sync.localhost:1337",
      VITE_SYSTEM_APP_ORIGIN: "http://app.localhost:1337",
      VITE_TENANT_BASE_DOMAIN: "example.com",
      VITE_TENANT_HOST_MODE: "disabled",
      VITE_TENANT_RESERVED_HOSTNAMES: "",
    });
  });

  it("declares the Agent Worker as a public observed Cloudflare Agent over the domain service", () => {
    const domain = {
      workerName: "ceird-test-domain",
    } as unknown as Cloudflare.Worker<DomainWorkerBindings>;
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
        AGENT_MUTATION_TOOLS_ENABLED: "true",
        AUTH_APP_ORIGIN: "https://app.example.com",
        AUTH_TRUSTED_ORIGINS:
          "https://app.example.com,https://*--main.example.com",
        CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
        NODE_ENV: "production",
      },
      name: "ceird-main-agent",
      url: false,
    });
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
    expect(agentWorkerProps.bindings.AI).toBe(aiGateway);
    expect(agentWorkerProps.bindings.ANALYTICS).toBe(workerAnalytics);
    expect(agentWorkerProps.bindings.DOMAIN).toBe(domain);
    expect(agentWorkerProps.bindings.CeirdAgent).toMatchObject({
      className: "CeirdAgent",
    });
  });

  it("declares the MCP Worker as a public observed adapter over the domain service", () => {
    const domain = {
      workerName: "ceird-test-domain",
    } as unknown as Cloudflare.Worker<DomainWorkerBindings>;

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
    expect(mcpWorkerProps.bindings.ANALYTICS).toBe(workerAnalytics);
    expect(mcpWorkerProps.bindings.DOMAIN).toBe(domain);
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
