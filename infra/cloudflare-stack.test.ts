import { describe, expect, it } from "@effect/vitest";
import * as Cloudflare from "alchemy/Cloudflare";
import type { WorkerProps } from "alchemy/Cloudflare";
import type { Input } from "alchemy/Input";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

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
import type { makeCloudflareStack } from "./cloudflare-stack.ts";
import {
  makeCloudflareHyperdriveProps,
  makeCloudflareWorkerOrigin,
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
      [Key in keyof Type]-?: NonNullable<Type[Key]> extends Value ? never : Key;
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
> &
  Pick<
    DomainWorkerConfigEnv,
    | "MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES"
    | "MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS"
  >;
type McpWorkerStackRuntimeConfigEnv = Required<
  Pick<McpWorkerConfigEnv, "ALCHEMY_STACK_NAME" | "ALCHEMY_STAGE" | "NODE_ENV">
>;
type ApiWorkerStackEnv = ApiWorkerConfiguredEnv & AlchemyInjectedWorkerEnv;
type DomainWorkerStackEnv = DomainWorkerConfiguredEnv &
  AlchemyInjectedWorkerEnv;
type McpWorkerStackEnv = McpWorkerConfiguredEnv & AlchemyInjectedWorkerEnv;
type DomainWorkerRuntimeStringValueKeys = Exclude<
  keyof DomainWorkerStackRuntimeConfigEnv,
  "AUTH_EMAIL_FROM" | "BETTER_AUTH_SECRET" | "GOOGLE_MAPS_API_KEY"
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
    readonly appOrigin: Input<string>;
    readonly mcpOrigin: Input<string>;
  }
    ? true
    : false
> = true;

describe("Cloudflare stack", () => {
  it("lets Alchemy own runtime stage injection for Worker env vars", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");
    const apiEnv = makeApiWorkerEnv();
    const domainEnv = makeDomainWorkerEnv({
      betterAuthSecret,
      config: configWithoutCloudflareBootstrapSecrets,
    });
    const mcpEnv = makeMcpWorkerEnv();
    const appEnv = makeAppWorkerEnv({
      apiOrigin: "https://api.example.com",
    });

    expect(apiEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(domainEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(mcpEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(appEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(apiEnv).toStrictEqual({ NODE_ENV: "production" });
    expect(domainEnv).toMatchObject({
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
    expect(appEnv).toStrictEqual({
      API_ORIGIN: "https://api.example.com",
      CEIRD_CLOUDFLARE: "1",
      VITE_API_ORIGIN: "https://api.example.com",
    });
  });

  it("passes disabled auth rate limits through to preview domain Workers", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");

    expect(
      makeDomainWorkerEnv({
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

  it("passes configured MCP authorized app cache settings through to domain Workers", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");

    expect(
      makeDomainWorkerEnv({
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

    const domainBindings = makeDomainWorkerBindings({
      authEmailQueue,
      config: configWithoutCloudflareBootstrapSecrets,
      hyperdrive,
    });
    const domainWorkerProps = makeDomainWorkerProps({
      authEmailQueue,
      betterAuthSecret: Redacted.make("better-auth-secret"),
      config: configWithoutCloudflareBootstrapSecrets,
      hyperdrive,
      name: "ceird-main-domain",
    });
    const apiBindings = makeApiWorkerBindings({ domain });
    const apiWorkerProps = makeApiWorkerProps({
      domain,
      hostname: "api.example.com",
      name: "ceird-main-api",
    });
    const mcpBindings = makeMcpWorkerBindings({ domain });
    const authEmail = Effect.runSync(domainBindings.AUTH_EMAIL);

    expect(Object.keys(domainBindings)).toStrictEqual([
      ...domainWorkerBindingKeys,
    ]);
    expect(Object.keys(apiBindings)).toStrictEqual([...apiWorkerBindingKeys]);
    expect(Object.keys(mcpBindings)).toStrictEqual([...mcpWorkerBindingKeys]);
    expect(domainWorkerBindingKeysMatchRuntimeContract).toBeTruthy();
    expect(domainWorkerBindingsSatisfyRuntimeContract).toBeTruthy();
    expect(domainWorkerRuntimeContractSatisfiesBindings).toBeTruthy();
    expect(apiWorkerBindingKeysMatchRuntimeContract).toBeTruthy();
    expect(apiWorkerBindingsSatisfyRuntimeContract).toBeTruthy();
    expect(apiWorkerRuntimeContractSatisfiesBindings).toBeTruthy();
    expect(mcpWorkerBindingKeysMatchRuntimeContract).toBeTruthy();
    expect(mcpWorkerBindingsSatisfyRuntimeContract).toBeTruthy();
    expect(mcpWorkerRuntimeContractSatisfiesBindings).toBeTruthy();
    expect(domainBindings.AUTH_EMAIL_QUEUE).toBe(authEmailQueue);
    expect(domainBindings.DATABASE).toBe(hyperdrive);
    expect(apiBindings.DOMAIN).toBe(domain);
    expect(mcpBindings.DOMAIN).toBe(domain);
    expect(domainWorkerProps).not.toHaveProperty("domain");
    expect(domainWorkerProps.main).toContain("/apps/domain/src/worker.ts");
    expect(domainWorkerProps.url).toBeFalsy();
    expect(apiWorkerProps).toMatchObject({
      domain: "api.example.com",
      env: { NODE_ENV: "production" },
      name: "ceird-main-api",
      url: true,
    });
    expect(apiWorkerProps.main).toContain("/apps/api/src/worker.ts");
    expect(apiWorkerProps.bindings.DOMAIN).toBe(domain);
    expect(Cloudflare.isSendEmail(authEmail)).toBeTruthy();
    expect(authEmail).toMatchObject({
      allowedSenderAddresses: ["no-reply@example.com"],
      name: "AuthEmailBinding",
    });
  });

  it("declares the MCP Worker as a public observed adapter over the domain service", () => {
    const domain = {
      workerName: "ceird-test-domain",
    } as unknown as Cloudflare.Worker<DomainWorkerBindings>;

    const mcpWorkerProps = makeMcpWorkerProps({
      domain,
      hostname: "mcp.example.com",
      name: "ceird-main-mcp",
    });

    expect(mcpWorkerProps).toMatchObject({
      domain: "mcp.example.com",
      env: { NODE_ENV: "production" },
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
    expect(mcpWorkerProps.main).toContain("/apps/mcp/src/worker.ts");
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
    expect(domainWorkerConfiguredStringValuesSatisfyRuntimeConfig).toBeTruthy();
    expect(apiWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBeTruthy();
    expect(domainWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBeTruthy();
    expect(mcpWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBeTruthy();
    expect(appWorkerEnvKeysMatchAppContract).toBeTruthy();
    expect(appWorkerRuntimeEnvSatisfiesAppContract).toBeTruthy();
    expect(appContractSatisfiesStackEnv).toBeTruthy();
    expect(appWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBeTruthy();
    expect(cloudflareStackOutputsIncludeCanonicalOrigins).toBeTruthy();
  });
});
