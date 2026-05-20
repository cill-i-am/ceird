import { describe, expect, it } from "@effect/vitest";
import * as Cloudflare from "alchemy/Cloudflare";
import type { WorkerProps } from "alchemy/Cloudflare";
import type { Input } from "alchemy/Input";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import type {
  AgentWorkerBindingRuntimeEnv,
  AgentWorkerConfigEnv,
} from "../apps/agent/src/platform/cloudflare/env.ts";
import type {
  ApiWorkerBindingRuntimeEnv,
  ApiWorkerConfigEnv,
} from "../apps/api/src/platform/cloudflare/env.ts";
import type { AppCloudflareEnv } from "../apps/app/src/cloudflare-env.d.ts";
import type {
  DomainWorkerBindingRuntimeEnv,
  DomainWorkerConfigEnv,
} from "../apps/domain/src/platform/cloudflare/env.ts";
import type {
  McpWorkerBindingRuntimeEnv,
  McpWorkerConfigEnv,
} from "../apps/mcp/src/platform/cloudflare/env.ts";
import type {
  ApiWorkerBindingEnv,
  ApiWorkerConfiguredEnv,
  AgentWorkerBindingEnv,
  AgentWorkerConfiguredEnv,
  DomainWorkerBindingEnv,
  DomainWorkerBindings,
  DomainWorkerConfiguredEnv,
  McpWorkerBindingEnv,
  McpWorkerConfiguredEnv,
  makeCloudflareStack,
} from "./cloudflare-stack.ts";
import {
  makeDomainWorkerBindings,
  makeDomainWorkerEnv,
  makeAgentWorkerBindings,
  makeAgentWorkerEnv,
  makeAgentWorkerProps,
  makeApiWorkerBindings,
  makeApiWorkerEnv,
  makeAppWorkerEnv,
  makeCloudflareHyperdriveProps,
  makeCloudflareWorkerOrigin,
  makeMcpWorkerBindings,
  makeMcpWorkerEnv,
  makeMcpWorkerProps,
  makeDomainWorkerProps,
} from "./cloudflare-stack.ts";
import { configWithoutCloudflareBootstrapSecrets } from "./stages.contract.ts";

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
      [Key in keyof Type]: Type[Key] extends Value ? never : Key;
    }[keyof Type],
    never
  > extends never
    ? true
    : false;

const domainWorkerBindingKeys = [
  "AUTH_EMAIL",
  "AUTH_EMAIL_QUEUE",
  "DATABASE",
] as const satisfies readonly (keyof DomainWorkerBindingEnv)[];
const apiWorkerBindingKeys = [
  "DOMAIN",
] as const satisfies readonly (keyof ApiWorkerBindingEnv)[];
const mcpWorkerBindingKeys = [
  "DOMAIN",
] as const satisfies readonly (keyof McpWorkerBindingEnv)[];
const agentWorkerBindingKeys = [
  "AI",
  "CeirdAgent",
  "DOMAIN",
] as const satisfies readonly (keyof AgentWorkerBindingEnv)[];

const domainWorkerBindingKeysMatchRuntimeContract: AssertTrue<
  HasSameKeys<DomainWorkerBindingEnv, DomainWorkerBindingRuntimeEnv>
> = true;
const domainWorkerBindingsSatisfyRuntimeContract: AssertTrue<
  DomainWorkerBindingEnv extends DomainWorkerBindingRuntimeEnv ? true : false
> = true;
const domainWorkerRuntimeContractSatisfiesBindings: AssertTrue<
  DomainWorkerBindingRuntimeEnv extends DomainWorkerBindingEnv ? true : false
> = true;

const apiWorkerBindingKeysMatchRuntimeContract: AssertTrue<
  HasSameKeys<ApiWorkerBindingEnv, ApiWorkerBindingRuntimeEnv>
> = true;
const apiWorkerBindingsSatisfyRuntimeContract: AssertTrue<
  ApiWorkerBindingEnv extends ApiWorkerBindingRuntimeEnv ? true : false
> = true;
const apiWorkerRuntimeContractSatisfiesBindings: AssertTrue<
  ApiWorkerBindingRuntimeEnv extends ApiWorkerBindingEnv ? true : false
> = true;
const mcpWorkerBindingKeysMatchRuntimeContract: AssertTrue<
  HasSameKeys<McpWorkerBindingEnv, McpWorkerBindingRuntimeEnv>
> = true;
const mcpWorkerBindingsSatisfyRuntimeContract: AssertTrue<
  McpWorkerBindingEnv extends McpWorkerBindingRuntimeEnv ? true : false
> = true;
const mcpWorkerRuntimeContractSatisfiesBindings: AssertTrue<
  McpWorkerBindingRuntimeEnv extends McpWorkerBindingEnv ? true : false
> = true;
const agentWorkerBindingKeysMatchRuntimeContract: AssertTrue<
  HasSameKeys<AgentWorkerBindingEnv, AgentWorkerBindingRuntimeEnv>
> = true;
const agentWorkerBindingsSatisfyRuntimeContract: AssertTrue<
  AgentWorkerBindingEnv extends AgentWorkerBindingRuntimeEnv ? true : false
> = true;
const agentWorkerRuntimeContractSatisfiesBindings: AssertTrue<
  AgentWorkerBindingRuntimeEnv extends AgentWorkerBindingEnv ? true : false
> = true;
interface AlchemyInjectedWorkerEnv {
  readonly ALCHEMY_STACK_NAME: string;
  readonly ALCHEMY_STAGE: string;
}
type ApiWorkerStackRuntimeConfigEnv = Required<
  Pick<ApiWorkerConfigEnv, "ALCHEMY_STACK_NAME" | "ALCHEMY_STAGE" | "NODE_ENV">
>;
type DomainWorkerStackRuntimeConfigEnv = Required<
  Pick<
    DomainWorkerConfigEnv,
    | "ALCHEMY_STACK_NAME"
    | "ALCHEMY_STAGE"
    | "AGENT_INTERNAL_SECRET"
    | "AUTH_APP_ORIGIN"
    | "AUTH_EMAIL_FROM"
    | "AUTH_EMAIL_FROM_NAME"
    | "AUTH_RATE_LIMIT_ENABLED"
    | "BETTER_AUTH_BASE_URL"
    | "BETTER_AUTH_SECRET"
    | "GOOGLE_MAPS_API_KEY"
    | "MCP_RESOURCE_URL"
    | "NODE_ENV"
    | "OAUTH_ISSUER_URL"
  >
>;
type McpWorkerStackRuntimeConfigEnv = Required<
  Pick<McpWorkerConfigEnv, "ALCHEMY_STACK_NAME" | "ALCHEMY_STAGE" | "NODE_ENV">
>;
type AgentWorkerStackRuntimeConfigEnv = Required<
  Pick<
    AgentWorkerConfigEnv,
    | "ALCHEMY_STACK_NAME"
    | "ALCHEMY_STAGE"
    | "AGENT_INTERNAL_SECRET"
    | "AGENT_MUTATION_TOOLS_ENABLED"
    | "AUTH_APP_ORIGIN"
    | "NODE_ENV"
  >
>;
type ApiWorkerStackEnv = ApiWorkerConfiguredEnv & AlchemyInjectedWorkerEnv;
type DomainWorkerStackEnv = DomainWorkerConfiguredEnv &
  AlchemyInjectedWorkerEnv;
type McpWorkerStackEnv = McpWorkerConfiguredEnv & AlchemyInjectedWorkerEnv;
type AgentWorkerStackEnv = AgentWorkerConfiguredEnv & AlchemyInjectedWorkerEnv;
type ApiWorkerRuntimeStringValueKeys = Exclude<
  keyof DomainWorkerStackRuntimeConfigEnv,
  | "AGENT_INTERNAL_SECRET"
  | "AUTH_EMAIL_FROM"
  | "BETTER_AUTH_SECRET"
  | "GOOGLE_MAPS_API_KEY"
>;
type ApiWorkerRuntimeStringValueEnv = Pick<
  DomainWorkerStackRuntimeConfigEnv,
  ApiWorkerRuntimeStringValueKeys
>;
type ApiWorkerStackStringValueEnv = Pick<
  DomainWorkerStackEnv,
  ApiWorkerRuntimeStringValueKeys
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
const apiWorkerConfiguredStringValuesSatisfyRuntimeConfig: AssertTrue<
  ApiWorkerStackStringValueEnv extends ApiWorkerRuntimeStringValueEnv
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
  }
    ? true
    : false
> = true;

describe("Cloudflare stack", () => {
  it("lets Alchemy own runtime stage injection for Worker env vars", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");
    const agentInternalSecret = Redacted.make("agent-secret");
    const apiEnv = makeApiWorkerEnv();
    const domainEnv = makeDomainWorkerEnv({
      agentInternalSecret,
      betterAuthSecret,
      config: configWithoutCloudflareBootstrapSecrets,
    });
    const mcpEnv = makeMcpWorkerEnv();
    const agentEnv = makeAgentWorkerEnv({
      agentInternalSecret,
      config: configWithoutCloudflareBootstrapSecrets,
    });
    const appEnv = makeAppWorkerEnv({
      apiOrigin: "https://api.example.com",
    });

    expect(apiEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(domainEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(mcpEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(agentEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(appEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(apiEnv).toStrictEqual({ NODE_ENV: "production" });
    expect(domainEnv).toMatchObject({
      AGENT_INTERNAL_SECRET: agentInternalSecret,
      AUTH_APP_ORIGIN: "https://app.example.com",
      AUTH_EMAIL_FROM_NAME: "Ceird",
      AUTH_RATE_LIMIT_ENABLED: "true",
      BETTER_AUTH_BASE_URL: "https://api.example.com/api/auth",
      MCP_RESOURCE_URL: "https://mcp.example.com/mcp",
      NODE_ENV: "production",
      OAUTH_ISSUER_URL: "https://api.example.com/api/auth",
    });
    expect(domainEnv.BETTER_AUTH_SECRET).toBe(betterAuthSecret);
    expect(mcpEnv).toStrictEqual({ NODE_ENV: "production" });
    expect(agentEnv).toStrictEqual({
      AGENT_INTERNAL_SECRET: agentInternalSecret,
      AGENT_MUTATION_TOOLS_ENABLED: "false",
      AUTH_APP_ORIGIN: "https://app.example.com",
      NODE_ENV: "production",
    });
    expect(appEnv).toStrictEqual({
      API_ORIGIN: "https://api.example.com",
      CEIRD_CLOUDFLARE: "1",
      VITE_API_ORIGIN: "https://api.example.com",
    });
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
      makeAppWorkerEnv({
        apiOrigin: "https://api.stage.example.com",
      })
    ).toStrictEqual({
      API_ORIGIN: "https://api.stage.example.com",
      CEIRD_CLOUDFLARE: "1",
      VITE_API_ORIGIN: "https://api.stage.example.com",
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
    const ai = {
      Type: "Cloudflare.AiGateway",
      id: "ceird-test-agent",
    } as unknown as Cloudflare.AiGateway;

    const domainBindings = makeDomainWorkerBindings({
      authEmailQueue,
      config: configWithoutCloudflareBootstrapSecrets,
      hyperdrive,
    });
    const domainWorkerProps = makeDomainWorkerProps({
      agentInternalSecret: Redacted.make("agent-secret"),
      authEmailQueue,
      betterAuthSecret: Redacted.make("better-auth-secret"),
      config: configWithoutCloudflareBootstrapSecrets,
      hyperdrive,
    });
    const apiBindings = makeApiWorkerBindings({ domain });
    const mcpBindings = makeMcpWorkerBindings({ domain });
    const agentBindings = makeAgentWorkerBindings({ ai, domain });
    const authEmail = Effect.runSync(domainBindings.AUTH_EMAIL);

    expect(Object.keys(domainBindings)).toStrictEqual([
      ...domainWorkerBindingKeys,
    ]);
    expect(Object.keys(apiBindings)).toStrictEqual([...apiWorkerBindingKeys]);
    expect(Object.keys(mcpBindings)).toStrictEqual([...mcpWorkerBindingKeys]);
    expect(Object.keys(agentBindings)).toStrictEqual([
      ...agentWorkerBindingKeys,
    ]);
    expect(domainWorkerBindingKeysMatchRuntimeContract).toBe(true);
    expect(domainWorkerBindingsSatisfyRuntimeContract).toBe(true);
    expect(domainWorkerRuntimeContractSatisfiesBindings).toBe(true);
    expect(apiWorkerBindingKeysMatchRuntimeContract).toBe(true);
    expect(apiWorkerBindingsSatisfyRuntimeContract).toBe(true);
    expect(apiWorkerRuntimeContractSatisfiesBindings).toBe(true);
    expect(mcpWorkerBindingKeysMatchRuntimeContract).toBe(true);
    expect(mcpWorkerBindingsSatisfyRuntimeContract).toBe(true);
    expect(mcpWorkerRuntimeContractSatisfiesBindings).toBe(true);
    expect(agentWorkerBindingKeysMatchRuntimeContract).toBe(true);
    expect(agentWorkerBindingsSatisfyRuntimeContract).toBe(true);
    expect(agentWorkerRuntimeContractSatisfiesBindings).toBe(true);
    expect(domainBindings.AUTH_EMAIL_QUEUE).toBe(authEmailQueue);
    expect(domainBindings.DATABASE).toBe(hyperdrive);
    expect(apiBindings.DOMAIN).toBe(domain);
    expect(mcpBindings.DOMAIN).toBe(domain);
    expect(agentBindings.DOMAIN).toBe(domain);
    expect(agentBindings.AI).toBe(ai);
    expect(agentBindings.CeirdAgent).toMatchObject({
      className: "CeirdAgent",
      name: "CeirdAgent",
    });
    expect(domainWorkerProps).not.toHaveProperty("domain");
    expect(domainWorkerProps.url).toBe(false);
    expect(Cloudflare.isSendEmail(authEmail)).toBe(true);
    expect(authEmail).toMatchObject({
      allowedSenderAddresses: ["no-reply@example.com"],
      name: "AuthEmailBinding",
    });
  });

  it("declares the Agent Worker as a public observed Cloudflare Agent over the domain service", () => {
    const domain = {
      workerName: "ceird-test-domain",
    } as unknown as Cloudflare.Worker<DomainWorkerBindings>;
    const ai = {
      Type: "Cloudflare.AiGateway",
      id: "ceird-test-agent",
    } as unknown as Cloudflare.AiGateway;
    const agentInternalSecret = Redacted.make("agent-secret");
    const agentWorkerProps = makeAgentWorkerProps({
      agentInternalSecret,
      ai,
      config: configWithoutCloudflareBootstrapSecrets,
      domain,
    });

    expect(agentWorkerProps).toMatchObject({
      domain: "agent.example.com",
      env: {
        AGENT_INTERNAL_SECRET: agentInternalSecret,
        AGENT_MUTATION_TOOLS_ENABLED: "false",
        NODE_ENV: "production",
      },
      main: "apps/agent/src/worker.ts",
      name: "ceird-main-agent",
      observability: {
        enabled: true,
        logs: {
          enabled: true,
          invocationLogs: false,
        },
        traces: {
          enabled: true,
        },
      },
      url: false,
    });
    expect(agentWorkerProps.bindings.DOMAIN).toBe(domain);
    expect(agentWorkerProps.bindings.AI).toBe(ai);
  });

  it("declares the MCP Worker as a public observed adapter over the domain service", () => {
    const domain = {
      workerName: "ceird-test-domain",
    } as unknown as Cloudflare.Worker<DomainWorkerBindings>;

    const mcpWorkerProps = makeMcpWorkerProps({
      config: configWithoutCloudflareBootstrapSecrets,
      domain,
    });

    expect(mcpWorkerProps).toMatchObject({
      domain: "mcp.example.com",
      env: { NODE_ENV: "production" },
      main: "apps/mcp/src/worker.ts",
      name: "ceird-main-mcp",
      observability: {
        enabled: true,
        logs: {
          enabled: true,
          invocationLogs: true,
        },
        traces: {
          enabled: true,
        },
      },
      url: false,
    });
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
    expect(apiWorkerConfiguredEnvKeysMatchRuntimeConfig).toBe(true);
    expect(domainWorkerConfiguredEnvKeysMatchRuntimeConfig).toBe(true);
    expect(mcpWorkerConfiguredEnvKeysMatchRuntimeConfig).toBe(true);
    expect(agentWorkerConfiguredEnvKeysMatchRuntimeConfig).toBe(true);
    expect(apiWorkerConfiguredStringValuesSatisfyRuntimeConfig).toBe(true);
    expect(apiWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBe(true);
    expect(domainWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBe(true);
    expect(mcpWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBe(true);
    expect(agentWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBe(true);
    expect(appWorkerEnvKeysMatchAppContract).toBe(true);
    expect(appWorkerRuntimeEnvSatisfiesAppContract).toBe(true);
    expect(appContractSatisfiesStackEnv).toBe(true);
    expect(appWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBe(true);
    expect(cloudflareStackOutputsIncludeCanonicalOrigins).toBe(true);
  });
});
