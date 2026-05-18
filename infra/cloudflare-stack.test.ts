import { describe, expect, it } from "@effect/vitest";
import * as Cloudflare from "alchemy/Cloudflare";
import type { WorkerProps } from "alchemy/Cloudflare";
import type { Input } from "alchemy/Input";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import type {
  ApiWorkerBindingRuntimeEnv,
  ApiWorkerConfigEnv,
} from "../apps/api/src/platform/cloudflare/env.ts";
import type { AppCloudflareEnv } from "../apps/app/src/cloudflare-env.d.ts";
import type {
  ApiWorkerBindingEnv,
  ApiWorkerConfiguredEnv,
  makeCloudflareStack,
} from "./cloudflare-stack.ts";
import {
  makeApiWorkerBindings,
  makeApiWorkerEnv,
  makeAppWorkerEnv,
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
      [Key in keyof Type]: Type[Key] extends Value ? never : Key;
    }[keyof Type],
    never
  > extends never
    ? true
    : false;

const apiWorkerBindingKeys = [
  "AUTH_EMAIL",
  "AUTH_EMAIL_QUEUE",
  "DATABASE",
] as const satisfies readonly (keyof ApiWorkerBindingEnv)[];

const apiWorkerBindingKeysMatchRuntimeContract: AssertTrue<
  HasSameKeys<ApiWorkerBindingEnv, ApiWorkerBindingRuntimeEnv>
> = true;
const apiWorkerBindingsSatisfyRuntimeContract: AssertTrue<
  ApiWorkerBindingEnv extends ApiWorkerBindingRuntimeEnv ? true : false
> = true;
const apiWorkerRuntimeContractSatisfiesBindings: AssertTrue<
  ApiWorkerBindingRuntimeEnv extends ApiWorkerBindingEnv ? true : false
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
    | "AUTH_APP_ORIGIN"
    | "AUTH_EMAIL_FROM"
    | "AUTH_EMAIL_FROM_NAME"
    | "AUTH_RATE_LIMIT_ENABLED"
    | "BETTER_AUTH_BASE_URL"
    | "BETTER_AUTH_SECRET"
    | "GOOGLE_MAPS_API_KEY"
    | "NODE_ENV"
  >
>;
type ApiWorkerStackEnv = ApiWorkerConfiguredEnv & AlchemyInjectedWorkerEnv;
type ApiWorkerRuntimeStringValueKeys = Exclude<
  keyof ApiWorkerStackRuntimeConfigEnv,
  "AUTH_EMAIL_FROM" | "BETTER_AUTH_SECRET" | "GOOGLE_MAPS_API_KEY"
>;
type ApiWorkerRuntimeStringValueEnv = Pick<
  ApiWorkerStackRuntimeConfigEnv,
  ApiWorkerRuntimeStringValueKeys
>;
type ApiWorkerStackStringValueEnv = Pick<
  ApiWorkerStackEnv,
  ApiWorkerRuntimeStringValueKeys
>;
type WorkerEnvValue = NonNullable<WorkerProps["env"]>[string];
type WorkerConfiguredEnvValue = Input<WorkerEnvValue>;
const apiWorkerConfiguredEnvKeysMatchRuntimeConfig: AssertTrue<
  HasSameKeys<ApiWorkerStackEnv, ApiWorkerStackRuntimeConfigEnv>
> = true;
const apiWorkerConfiguredStringValuesSatisfyRuntimeConfig: AssertTrue<
  ApiWorkerStackStringValueEnv extends ApiWorkerRuntimeStringValueEnv
    ? true
    : false
> = true;
const apiWorkerConfiguredValuesSatisfyAlchemyWorkerEnv: AssertTrue<
  AllPropertyValuesExtend<ApiWorkerConfiguredEnv, WorkerConfiguredEnvValue>
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
  }
    ? true
    : false
> = true;

describe("Cloudflare stack", () => {
  it("lets Alchemy own runtime stage injection for Worker env vars", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");
    const apiEnv = makeApiWorkerEnv({
      betterAuthSecret,
      config: configWithoutCloudflareBootstrapSecrets,
    });
    const appEnv = makeAppWorkerEnv({
      apiOrigin: "https://api.example.com",
    });

    expect(apiEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(appEnv).not.toHaveProperty("ALCHEMY_STAGE");
    expect(apiEnv).toMatchObject({
      AUTH_APP_ORIGIN: "https://app.example.com",
      AUTH_EMAIL_FROM_NAME: "Ceird",
      AUTH_RATE_LIMIT_ENABLED: "true",
      BETTER_AUTH_BASE_URL: "https://api.example.com/api/auth",
      NODE_ENV: "production",
    });
    expect(apiEnv.BETTER_AUTH_SECRET).toBe(betterAuthSecret);
    expect(appEnv).toStrictEqual({
      API_ORIGIN: "https://api.example.com",
      CEIRD_CLOUDFLARE: "1",
      VITE_API_ORIGIN: "https://api.example.com",
    });
  });

  it("passes disabled auth rate limits through to preview API Workers", () => {
    const betterAuthSecret = Redacted.make("better-auth-secret");

    expect(
      makeApiWorkerEnv({
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

  it("declares the API Worker cloud resources as typed Alchemy bindings", () => {
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

    const bindings = makeApiWorkerBindings({
      authEmailQueue,
      config: configWithoutCloudflareBootstrapSecrets,
      hyperdrive,
    });
    const authEmail = Effect.runSync(bindings.AUTH_EMAIL);

    expect(Object.keys(bindings)).toStrictEqual([...apiWorkerBindingKeys]);
    expect(apiWorkerBindingKeysMatchRuntimeContract).toBe(true);
    expect(apiWorkerBindingsSatisfyRuntimeContract).toBe(true);
    expect(apiWorkerRuntimeContractSatisfiesBindings).toBe(true);
    expect(bindings.AUTH_EMAIL_QUEUE).toBe(authEmailQueue);
    expect(bindings.DATABASE).toBe(hyperdrive);
    expect(Cloudflare.isSendEmail(authEmail)).toBe(true);
    expect(authEmail).toMatchObject({
      allowedSenderAddresses: ["no-reply@example.com"],
      name: "AuthEmailBinding",
    });
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
    expect(apiWorkerConfiguredStringValuesSatisfyRuntimeConfig).toBe(true);
    expect(apiWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBe(true);
    expect(appWorkerEnvKeysMatchAppContract).toBe(true);
    expect(appWorkerRuntimeEnvSatisfiesAppContract).toBe(true);
    expect(appContractSatisfiesStackEnv).toBe(true);
    expect(appWorkerConfiguredValuesSatisfyAlchemyWorkerEnv).toBe(true);
    expect(cloudflareStackOutputsIncludeCanonicalOrigins).toBe(true);
  });
});
