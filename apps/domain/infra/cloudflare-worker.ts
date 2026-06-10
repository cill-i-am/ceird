/// <reference types="@cloudflare/workers-types" />

import * as Cloudflare from "alchemy/Cloudflare";
import type { WorkerProps } from "alchemy/Cloudflare";
import type { Input, InputProps } from "alchemy/Input";
import * as Output from "alchemy/Output";
import * as Redacted from "effect/Redacted";

import {
  ceirdDomainWorkerPlacement,
  ceirdWorkerCompatibility,
  ceirdWorkerObservability,
} from "../../../infra/cloudflare-worker-defaults.ts";

const domainWorkerMain = new URL("../src/worker.ts", import.meta.url).pathname;
const DOMAIN_WORKER_AUTH_RATE_LIMIT_CLEANUP_CRON = "17 3 * * *" as const;
const DOMAIN_WORKER_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE = 1000;
const DOMAIN_WORKER_AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES = 10;
const DOMAIN_WORKER_AUTH_RATE_LIMIT_RETENTION_HOURS = 48;

export interface DomainWorkerStageConfig {
  readonly agentActionRunStaleAfterSeconds: number;
  readonly apiHostname: string;
  readonly appHostname: string;
  readonly authCaptchaEnabled?: boolean | undefined;
  readonly authCaptchaSiteVerifyUrlOverride?: string | undefined;
  readonly authCaptchaTurnstileSecretKey?:
    | Redacted.Redacted<string>
    | undefined;
  readonly authCookieDomain?: string | undefined;
  readonly authCookiePrefix: string;
  readonly authEmailFrom: Redacted.Redacted<string>;
  readonly authEmailFromName: string;
  readonly authPasswordCompromiseCheckEnabled?: boolean | undefined;
  readonly authPasswordCompromiseCheckRangeUrlOverride?: string | undefined;
  readonly authRateLimitCleanupEnabled?: boolean | undefined;
  readonly authRateLimitEnabled: boolean;
  readonly googleMapsApiKey: Redacted.Redacted<string>;
  readonly googleMapsRoutesApiKey?: Redacted.Redacted<string> | undefined;
  readonly mcpAuthorizedAppCacheMaxEntries?: number | undefined;
  readonly mcpAuthorizedAppCacheTtlSeconds?: number | undefined;
  readonly mcpHostname: string;
  readonly proximityOriginTokenTtlSeconds?: number | undefined;
  readonly routeProvider: "google_routes" | "test";
  readonly stage?: string | undefined;
  readonly tenantBaseDomain: string;
  readonly tenantTrustedOriginPattern: string | undefined;
  readonly workerAnalyticsSampleRate: number;
}

export interface DomainWorkerResourceEnv {
  readonly ANALYTICS: Cloudflare.AnalyticsEngineDataset;
  readonly AUTH_EMAIL: Cloudflare.SendEmail;
  readonly AUTH_EMAIL_QUEUE: Cloudflare.Queue;
  readonly DATABASE: Cloudflare.Hyperdrive;
}

type DomainWorkerLocalResourceEnv = Pick<DomainWorkerResourceEnv, "DATABASE">;
type DomainWorkerSecretEnvValue = string | Redacted.Redacted<string>;
type SerializedRedactedMarker =
  | {
      readonly _tag: "Redacted";
      readonly value: string;
    }
  | {
      readonly __redacted__: string;
    };
type WorkerEnvShape<Env extends object> = Env extends object
  ? {
      readonly [Key in keyof Env]: Env[Key];
    }
  : never;
type WorkerEnvInput<Env extends object> = Env extends object
  ? {
      readonly [Key in keyof WorkerEnvShape<Env>]: undefined extends WorkerEnvShape<Env>[Key]
        ? Input<Exclude<WorkerEnvShape<Env>[Key], undefined>> | undefined
        : Input<WorkerEnvShape<Env>[Key]>;
    }
  : never;

export type DomainWorkerBindingEnv = Cloudflare.InferEnv<
  WorkerEnvShape<DomainWorkerResourceEnv>
>;

export interface DomainWorkerConfiguredEnv {
  readonly AGENT_ACTION_RUN_STALE_AFTER_SECONDS: string;
  readonly AGENT_INTERNAL_SECRET: DomainWorkerSecretEnvValue;
  readonly AUTH_APP_ORIGIN: string;
  readonly AUTH_CAPTCHA_ENABLED?: "false" | "true" | undefined;
  readonly AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE?: string | undefined;
  readonly AUTH_CAPTCHA_TURNSTILE_SECRET_KEY?:
    | DomainWorkerSecretEnvValue
    | undefined;
  readonly AUTH_COOKIE_DOMAIN?: string | undefined;
  readonly AUTH_COOKIE_PREFIX: string;
  readonly AUTH_EMAIL_FROM: DomainWorkerSecretEnvValue;
  readonly AUTH_EMAIL_FROM_NAME: string;
  readonly AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED?:
    | "false"
    | "true"
    | undefined;
  readonly AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE?:
    | string
    | undefined;
  readonly AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE: string;
  readonly AUTH_RATE_LIMIT_CLEANUP_ENABLED: "false" | "true";
  readonly AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES: string;
  readonly AUTH_RATE_LIMIT_RETENTION_HOURS: string;
  readonly AUTH_RATE_LIMIT_ENABLED: "false" | "true";
  readonly AUTH_TRUSTED_ORIGINS: string;
  readonly BETTER_AUTH_BASE_URL: string;
  readonly BETTER_AUTH_SECRET: DomainWorkerSecretEnvValue;
  readonly BETTER_AUTH_SECRETS?: DomainWorkerSecretEnvValue | undefined;
  readonly CEIRD_LOCAL_DEV?: "true" | undefined;
  readonly CEIRD_ROUTE_PROVIDER: "google_routes" | "test";
  readonly CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: string;
  readonly DATABASE_URL?: DomainWorkerSecretEnvValue | undefined;
  readonly GOOGLE_MAPS_API_KEY: DomainWorkerSecretEnvValue;
  readonly GOOGLE_MAPS_ROUTES_API_KEY?: DomainWorkerSecretEnvValue | undefined;
  readonly MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES?: string | undefined;
  readonly MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS?: string | undefined;
  readonly MCP_RESOURCE_URL: string;
  readonly NODE_ENV: "production";
  readonly OAUTH_ISSUER_URL: string;
  readonly PROXIMITY_ORIGIN_TOKEN_TTL_SECONDS?: string | undefined;
}

type DomainWorkerLocalEnv = DomainWorkerLocalResourceEnv &
  DomainWorkerConfiguredEnv;
type DomainWorkerDeployedEnv = DomainWorkerResourceEnv &
  DomainWorkerConfiguredEnv;
type DomainWorkerConfiguredEnvInput = WorkerEnvInput<DomainWorkerConfiguredEnv>;
type DomainWorkerResourceEnvInput = WorkerEnvInput<DomainWorkerResourceEnv>;
type DomainWorkerLocalEnvInput = WorkerEnvInput<DomainWorkerLocalEnv>;
type DomainWorkerDeployedEnvInput = WorkerEnvInput<DomainWorkerDeployedEnv>;
interface DomainWorkerBaseProps {
  readonly name: string;
  readonly main: typeof domainWorkerMain;
  readonly compatibility: typeof ceirdWorkerCompatibility;
  readonly observability: typeof ceirdWorkerObservability;
  readonly placement: typeof ceirdDomainWorkerPlacement;
  readonly url: false;
}
type DomainWorkerLocalProps = DomainWorkerBaseProps & {
  readonly env: DomainWorkerLocalEnvInput;
  readonly crons: [];
};
type DomainWorkerDeployedProps = DomainWorkerBaseProps & {
  readonly env: DomainWorkerDeployedEnvInput;
  readonly crons: [typeof DOMAIN_WORKER_AUTH_RATE_LIMIT_CLEANUP_CRON];
};

interface MakeDomainWorkerResourceEnvInput {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly authEmailQueue: Cloudflare.Queue;
  readonly config: Pick<DomainWorkerStageConfig, "authEmailFrom">;
  readonly hyperdrive: Cloudflare.Hyperdrive;
}

type MakeDomainWorkerEnvInput = MakeDomainWorkerResourceEnvInput & {
  readonly agentInternalSecret: Input<Redacted.Redacted<string>>;
  readonly betterAuthSecret: Input<Redacted.Redacted<string>>;
  readonly betterAuthSecrets?: Input<Redacted.Redacted<string>> | undefined;
  readonly config: DomainWorkerStageConfig;
  readonly databaseUrl?: Input<Redacted.Redacted<string>> | undefined;
  readonly localOrigins?:
    | {
        readonly app: string;
        readonly api: string;
        readonly mcp: string;
      }
    | undefined;
};

type MakeDomainWorkerPropsInput = MakeDomainWorkerEnvInput & {
  readonly name: string;
};

export type DomainWorkerResource = Cloudflare.Worker;

function optionalDomainWorkerEnv<
  const Key extends keyof DomainWorkerConfiguredEnvInput,
>(
  key: Key,
  value: DomainWorkerConfiguredEnvInput[Key] | undefined
): Partial<Pick<DomainWorkerConfiguredEnvInput, Key>> {
  if (value === undefined) {
    return {};
  }

  return {
    [key]: value,
  } as Pick<DomainWorkerConfiguredEnvInput, Key>;
}

function isSerializedRedactedMarker(
  value: unknown
): value is SerializedRedactedMarker {
  return (
    typeof value === "object" &&
    value !== null &&
    (("_tag" in value &&
      value._tag === "Redacted" &&
      "value" in value &&
      typeof value.value === "string") ||
      ("__redacted__" in value && typeof value.__redacted__ === "string"))
  );
}

function redactedSecretString(value: unknown): string {
  if (Redacted.isRedacted(value)) {
    return Redacted.value(value) as string;
  }

  if (isSerializedRedactedMarker(value)) {
    return "__redacted__" in value ? value.__redacted__ : value.value;
  }

  throw new TypeError("Expected a redacted string Worker env value");
}

function localDomainWorkerSecretInput<Req>(
  value: Output.Output<Redacted.Redacted<string>, Req>
): Output.Output<string, Req>;
function localDomainWorkerSecretInput(value: Redacted.Redacted<string>): string;
function localDomainWorkerSecretInput(
  value: Input<Redacted.Redacted<string>>
): Input<string>;
function localDomainWorkerSecretInput(
  value: Input<Redacted.Redacted<string>>
): Input<string> {
  if (Output.isOutput(value)) {
    return value.pipe(Output.map(redactedSecretString));
  }

  if (Redacted.isRedacted(value)) {
    return redactedSecretString(value);
  }

  return redactedSecretString(value);
}

function domainWorkerSecretEnvValue(
  value: Input<Redacted.Redacted<string>>,
  localDev: boolean | undefined
): Input<DomainWorkerSecretEnvValue> {
  return localDev === true ? localDomainWorkerSecretInput(value) : value;
}

function optionalDomainWorkerSecretEnv<
  const Key extends keyof DomainWorkerConfiguredEnvInput,
>(
  key: Key,
  value: Input<Redacted.Redacted<string>> | undefined,
  localDev: boolean | undefined
): Partial<Pick<DomainWorkerConfiguredEnvInput, Key>> {
  return optionalDomainWorkerEnv(
    key,
    value === undefined
      ? undefined
      : (domainWorkerSecretEnvValue(
          value,
          localDev
        ) as DomainWorkerConfiguredEnvInput[Key])
  );
}

function booleanWorkerEnvValue(value: boolean | undefined) {
  if (value === undefined) {
    return;
  }

  return value ? "true" : "false";
}

function stringifiedNumberWorkerEnvValue(value: number | undefined) {
  if (value === undefined) {
    return;
  }

  return String(value);
}

function makeDomainWorkerOrigin(input: {
  readonly hostname: string;
  readonly localDev?: boolean | undefined;
  readonly localOrigin?: string | undefined;
}) {
  if (input.localDev === true && input.localOrigin) {
    return input.localOrigin;
  }

  return `https://${input.hostname}`;
}

function makeDomainWorkerTrustedOrigins(input: {
  readonly authAppOrigin: string;
  readonly localDev?: boolean | undefined;
  readonly tenantTrustedOriginPattern: string | undefined;
}) {
  return [
    input.authAppOrigin,
    input.localDev === true ? undefined : input.tenantTrustedOriginPattern,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(",");
}

function makeDomainWorkerPasswordCompromiseCheckEnvValue(input: {
  readonly configuredValue?: boolean | undefined;
  readonly localDev?: boolean | undefined;
}) {
  return booleanWorkerEnvValue(
    input.configuredValue ?? (input.localDev === true ? false : undefined)
  );
}

function makeDomainWorkerCookieDomainEnvValue(input: {
  readonly authCookieDomain?: string | undefined;
  readonly localDev?: boolean | undefined;
}) {
  if (input.localDev === true) {
    return;
  }

  return input.authCookieDomain;
}

function makeDomainWorkerRateLimitCleanupEnabledEnvValue(input: {
  readonly configuredValue?: boolean | undefined;
  readonly localDev?: boolean | undefined;
}) {
  return booleanWorkerEnvValue(
    input.configuredValue ?? input.localDev !== true
  );
}

function makeLocalDomainWorkerResourceEnv(input: {
  readonly hyperdrive: Cloudflare.Hyperdrive;
}) {
  return {
    DATABASE: input.hyperdrive,
  } satisfies WorkerEnvInput<DomainWorkerLocalResourceEnv>;
}

function makeDeployedDomainWorkerResourceEnv(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly authEmailQueue: Cloudflare.Queue;
  readonly config: Pick<DomainWorkerStageConfig, "authEmailFrom">;
  readonly hyperdrive: Cloudflare.Hyperdrive;
}) {
  return {
    ANALYTICS: input.analytics,
    AUTH_EMAIL: Cloudflare.SendEmail("AuthEmailBinding", {
      allowedSenderAddresses: [Redacted.value(input.config.authEmailFrom)],
    }),
    AUTH_EMAIL_QUEUE: input.authEmailQueue,
    DATABASE: input.hyperdrive,
  } satisfies DomainWorkerResourceEnvInput;
}

export function makeDomainWorkerResourceEnv(
  input: MakeDomainWorkerResourceEnvInput & { readonly localDev: true }
): WorkerEnvInput<DomainWorkerLocalResourceEnv>;
export function makeDomainWorkerResourceEnv(
  input: MakeDomainWorkerResourceEnvInput & {
    readonly localDev?: false | undefined;
  }
): DomainWorkerResourceEnvInput;
export function makeDomainWorkerResourceEnv(
  input: MakeDomainWorkerResourceEnvInput & {
    readonly localDev?: boolean | undefined;
  }
): DomainWorkerResourceEnvInput | WorkerEnvInput<DomainWorkerLocalResourceEnv>;
export function makeDomainWorkerResourceEnv(
  input: MakeDomainWorkerResourceEnvInput & {
    readonly localDev?: boolean | undefined;
  }
): DomainWorkerResourceEnvInput | WorkerEnvInput<DomainWorkerLocalResourceEnv> {
  if (input.localDev === true) {
    return makeLocalDomainWorkerResourceEnv({ hyperdrive: input.hyperdrive });
  }

  return makeDeployedDomainWorkerResourceEnv(input);
}

export function makeDomainWorkerConfiguredEnv(input: {
  readonly agentInternalSecret: Input<Redacted.Redacted<string>>;
  readonly betterAuthSecret: Input<Redacted.Redacted<string>>;
  readonly betterAuthSecrets?: Input<Redacted.Redacted<string>> | undefined;
  readonly config: DomainWorkerStageConfig;
  readonly databaseUrl?: Input<Redacted.Redacted<string>> | undefined;
  readonly localDev?: boolean | undefined;
  readonly localOrigins?:
    | {
        readonly app: string;
        readonly api: string;
        readonly mcp: string;
      }
    | undefined;
}) {
  const authAppOrigin = makeDomainWorkerOrigin({
    hostname: input.config.appHostname,
    localDev: input.localDev,
    localOrigin: input.localOrigins?.app,
  });
  const apiOrigin = makeDomainWorkerOrigin({
    hostname: input.config.apiHostname,
    localDev: input.localDev,
    localOrigin: input.localOrigins?.api,
  });
  const mcpOrigin = makeDomainWorkerOrigin({
    hostname: input.config.mcpHostname,
    localDev: input.localDev,
    localOrigin: input.localOrigins?.mcp,
  });
  const betterAuthBaseUrl = `${apiOrigin}/api/auth`;
  const authTrustedOrigins = makeDomainWorkerTrustedOrigins({
    authAppOrigin,
    localDev: input.localDev,
    tenantTrustedOriginPattern: input.config.tenantTrustedOriginPattern,
  });
  const authPasswordCompromiseCheckEnabled =
    makeDomainWorkerPasswordCompromiseCheckEnvValue({
      configuredValue: input.config.authPasswordCompromiseCheckEnabled,
      localDev: input.localDev,
    });

  return {
    AGENT_ACTION_RUN_STALE_AFTER_SECONDS: String(
      input.config.agentActionRunStaleAfterSeconds
    ),
    AGENT_INTERNAL_SECRET: domainWorkerSecretEnvValue(
      input.agentInternalSecret,
      input.localDev
    ),
    AUTH_APP_ORIGIN: authAppOrigin,
    ...optionalDomainWorkerEnv(
      "AUTH_CAPTCHA_ENABLED",
      booleanWorkerEnvValue(input.config.authCaptchaEnabled)
    ),
    ...optionalDomainWorkerEnv(
      "AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE",
      input.config.authCaptchaSiteVerifyUrlOverride
    ),
    ...optionalDomainWorkerSecretEnv(
      "AUTH_CAPTCHA_TURNSTILE_SECRET_KEY",
      input.config.authCaptchaTurnstileSecretKey,
      input.localDev
    ),
    AUTH_COOKIE_PREFIX: input.config.authCookiePrefix,
    AUTH_EMAIL_FROM: domainWorkerSecretEnvValue(
      input.config.authEmailFrom,
      input.localDev
    ),
    AUTH_EMAIL_FROM_NAME: input.config.authEmailFromName,
    ...optionalDomainWorkerEnv(
      "AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED",
      authPasswordCompromiseCheckEnabled
    ),
    ...optionalDomainWorkerEnv(
      "AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE",
      input.config.authPasswordCompromiseCheckRangeUrlOverride
    ),
    AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE: String(
      DOMAIN_WORKER_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE
    ),
    AUTH_RATE_LIMIT_CLEANUP_ENABLED:
      makeDomainWorkerRateLimitCleanupEnabledEnvValue({
        configuredValue: input.config.authRateLimitCleanupEnabled,
        localDev: input.localDev,
      }) ?? "true",
    AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES: String(
      DOMAIN_WORKER_AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES
    ),
    AUTH_RATE_LIMIT_RETENTION_HOURS: String(
      DOMAIN_WORKER_AUTH_RATE_LIMIT_RETENTION_HOURS
    ),
    AUTH_RATE_LIMIT_ENABLED: input.config.authRateLimitEnabled
      ? "true"
      : "false",
    AUTH_TRUSTED_ORIGINS: authTrustedOrigins,
    BETTER_AUTH_BASE_URL: betterAuthBaseUrl,
    BETTER_AUTH_SECRET: domainWorkerSecretEnvValue(
      input.betterAuthSecret,
      input.localDev
    ),
    ...optionalDomainWorkerSecretEnv(
      "BETTER_AUTH_SECRETS",
      input.betterAuthSecrets,
      input.localDev
    ),
    ...optionalDomainWorkerEnv(
      "CEIRD_LOCAL_DEV",
      input.localDev === true ? "true" : undefined
    ),
    CEIRD_ROUTE_PROVIDER: input.config.routeProvider,
    CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: String(
      input.config.workerAnalyticsSampleRate
    ),
    ...optionalDomainWorkerSecretEnv(
      "DATABASE_URL",
      input.databaseUrl,
      input.localDev
    ),
    GOOGLE_MAPS_API_KEY: domainWorkerSecretEnvValue(
      input.config.googleMapsApiKey,
      input.localDev
    ),
    ...optionalDomainWorkerSecretEnv(
      "GOOGLE_MAPS_ROUTES_API_KEY",
      input.config.googleMapsRoutesApiKey,
      input.localDev
    ),
    ...optionalDomainWorkerEnv(
      "AUTH_COOKIE_DOMAIN",
      makeDomainWorkerCookieDomainEnvValue({
        authCookieDomain: input.config.authCookieDomain,
        localDev: input.localDev,
      })
    ),
    ...optionalDomainWorkerEnv(
      "MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES",
      stringifiedNumberWorkerEnvValue(
        input.config.mcpAuthorizedAppCacheMaxEntries
      )
    ),
    ...optionalDomainWorkerEnv(
      "MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS",
      stringifiedNumberWorkerEnvValue(
        input.config.mcpAuthorizedAppCacheTtlSeconds
      )
    ),
    ...optionalDomainWorkerEnv(
      "PROXIMITY_ORIGIN_TOKEN_TTL_SECONDS",
      stringifiedNumberWorkerEnvValue(
        input.config.proximityOriginTokenTtlSeconds
      )
    ),
    MCP_RESOURCE_URL: `${mcpOrigin}/mcp`,
    NODE_ENV: "production",
    OAUTH_ISSUER_URL: betterAuthBaseUrl,
  } satisfies DomainWorkerConfiguredEnvInput;
}

function makeLocalDomainWorkerEnv(
  input: MakeDomainWorkerEnvInput & { readonly localDev: true }
): DomainWorkerLocalEnvInput {
  return {
    ...makeLocalDomainWorkerResourceEnv({ hyperdrive: input.hyperdrive }),
    ...makeDomainWorkerConfiguredEnv(input),
  } satisfies DomainWorkerLocalEnvInput;
}

function makeDeployedDomainWorkerEnv(
  input: MakeDomainWorkerEnvInput & { readonly localDev?: false | undefined }
): DomainWorkerDeployedEnvInput {
  return {
    ...makeDeployedDomainWorkerResourceEnv({
      analytics: input.analytics,
      authEmailQueue: input.authEmailQueue,
      config: input.config,
      hyperdrive: input.hyperdrive,
    }),
    ...makeDomainWorkerConfiguredEnv(input),
  } satisfies DomainWorkerDeployedEnvInput;
}

export function makeDomainWorkerEnv(
  input: MakeDomainWorkerEnvInput & {
    readonly localDev?: boolean | undefined;
  }
): DomainWorkerLocalEnvInput | DomainWorkerDeployedEnvInput {
  if (input.localDev === true) {
    return makeLocalDomainWorkerEnv({ ...input, localDev: true });
  }

  return makeDeployedDomainWorkerEnv({ ...input, localDev: false });
}

export function makeDomainWorkerProps(
  input: MakeDomainWorkerPropsInput & { readonly localDev: true }
): DomainWorkerLocalProps;
export function makeDomainWorkerProps(
  input: MakeDomainWorkerPropsInput & {
    readonly localDev?: false | undefined;
  }
): DomainWorkerDeployedProps;
export function makeDomainWorkerProps(
  input: MakeDomainWorkerPropsInput & {
    readonly localDev?: boolean | undefined;
  }
): DomainWorkerLocalProps | DomainWorkerDeployedProps;
export function makeDomainWorkerProps(
  input: MakeDomainWorkerPropsInput & {
    readonly localDev?: boolean | undefined;
  }
): DomainWorkerLocalProps | DomainWorkerDeployedProps {
  const baseProps = {
    name: input.name,
    main: domainWorkerMain,
    compatibility: ceirdWorkerCompatibility,
    observability: ceirdWorkerObservability,
    placement: ceirdDomainWorkerPlacement,
    url: false as const,
  };

  if (input.localDev === true) {
    const props = {
      ...baseProps,
      env: makeLocalDomainWorkerEnv({ ...input, localDev: true }),
      crons: [],
    } satisfies DomainWorkerLocalProps;

    props satisfies InputProps<
      WorkerProps<WorkerEnvShape<DomainWorkerLocalEnv>>
    >;
    return props;
  }

  const props = {
    ...baseProps,
    env: makeDeployedDomainWorkerEnv({ ...input, localDev: false }),
    crons: [DOMAIN_WORKER_AUTH_RATE_LIMIT_CLEANUP_CRON],
  } satisfies DomainWorkerDeployedProps;

  props satisfies InputProps<
    WorkerProps<WorkerEnvShape<DomainWorkerDeployedEnv>>
  >;
  return props;
}

export function makeDomainWorker(input: {
  readonly agentInternalSecret: Input<Redacted.Redacted<string>>;
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly authEmailQueue: Cloudflare.Queue;
  readonly betterAuthSecret: Input<Redacted.Redacted<string>>;
  readonly betterAuthSecrets?: Input<Redacted.Redacted<string>> | undefined;
  readonly config: DomainWorkerStageConfig;
  readonly databaseUrl?: Input<Redacted.Redacted<string>> | undefined;
  readonly hyperdrive: Cloudflare.Hyperdrive;
  readonly localDev?: boolean | undefined;
  readonly localOrigins?:
    | {
        readonly app: string;
        readonly api: string;
        readonly mcp: string;
      }
    | undefined;
  readonly name: string;
}) {
  return Cloudflare.Worker("Domain", makeDomainWorkerProps(input));
}
