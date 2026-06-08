import { createHash } from "node:crypto";

import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { decodeMcpAuthorizedAppCacheConfigInteger } from "../apps/domain/src/domains/mcp/cache-config.ts";

export const domainDrizzleSchemaPath = "infra/domain-drizzle-schema.ts";
export const domainDrizzleMigrationsDir = "apps/domain/drizzle";
export const domainAlchemyDrizzleMigrationsDir = "apps/domain/drizzle-alchemy";

export const InfraStage = Schema.NonEmptyString;
export type InfraStage = Schema.Schema.Type<typeof InfraStage>;

const maxStageSlugLength = 40;

const domainNamePattern = /^[a-z0-9.-]+$/;
const emailAddressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const providerResourceNamePattern = /^[a-z0-9-]+$/;

function isLoopbackHostname(hostname: string) {
  const normalizedHostname = hostname
    .toLowerCase()
    .replace(/^\[(?<hostname>.*)\]$/, "$<hostname>");

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "::1" ||
    normalizedHostname.endsWith(".localhost") ||
    isIPv4LoopbackHostname(normalizedHostname) ||
    isIPv4MappedIPv6LoopbackHostname(normalizedHostname)
  );
}

function isIPv4LoopbackHostname(hostname: string) {
  const parts = hostname.split(".");

  return (
    parts.length === 4 &&
    parts[0] === "127" &&
    parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) {
        return false;
      }

      const octet = Number(part);
      return Number.isInteger(octet) && octet >= 0 && octet <= 255;
    })
  );
}

function isIPv4MappedIPv6LoopbackHostname(hostname: string) {
  const dottedIPv4Prefix = "::ffff:";

  if (hostname.startsWith(dottedIPv4Prefix)) {
    return isIPv4LoopbackHostname(hostname.slice(dottedIPv4Prefix.length));
  }

  const hexMappedIPv4Match =
    /^::ffff:(?<high>[0-9a-f]{1,4}):(?<low>[0-9a-f]{1,4})$/.exec(hostname);

  if (!hexMappedIPv4Match?.groups) {
    return false;
  }

  const high = Number.parseInt(hexMappedIPv4Match.groups.high, 16);
  const low = Number.parseInt(hexMappedIPv4Match.groups.low, 16);

  return (
    Number.isInteger(high) &&
    Number.isInteger(low) &&
    high >= 0 &&
    high <= 65_535 &&
    low >= 0 &&
    low <= 65_535 &&
    Math.floor(high / 256) === 127
  );
}

export type TenantHostMode = "disabled" | "production" | "stage";
export const ElectricContainerInstanceType = Schema.Literals([
  "lite",
  "dev",
  "basic",
  "standard",
  "standard-1",
  "standard-2",
  "standard-3",
  "standard-4",
] as const);
export type ElectricContainerInstanceType = Schema.Schema.Type<
  typeof ElectricContainerInstanceType
>;

export const DomainName = Schema.NonEmptyString.check(
  Schema.isPattern(domainNamePattern, {
    message:
      "Domain names may only contain lowercase letters, digits, dots, and hyphens",
  })
);
export type DomainName = Schema.Schema.Type<typeof DomainName>;

export const ProviderResourceName = Schema.NonEmptyString.check(
  Schema.isPattern(providerResourceNamePattern, {
    message:
      "Provider resource names may only contain lowercase letters, digits, and hyphens",
  })
);
export type ProviderResourceName = Schema.Schema.Type<
  typeof ProviderResourceName
>;

export const InfraGoogleMapsApiKey = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/root-infra/GoogleMapsApiKey")
);
export type InfraGoogleMapsApiKey = Schema.Schema.Type<
  typeof InfraGoogleMapsApiKey
>;

export interface InfraStageConfig {
  readonly agentActionRunStaleAfterSeconds: number;
  readonly appName: string;
  readonly stage: string;
  readonly zoneName: DomainName;
  readonly appHostname: DomainName;
  readonly apiHostname: DomainName;
  readonly agentHostname: DomainName;
  readonly mcpHostname: DomainName;
  readonly syncHostname: DomainName;
  readonly authCookiePrefix: string;
  readonly authCookieDomain: DomainName | undefined;
  readonly authCaptchaEnabled: boolean | undefined;
  readonly authCaptchaSiteVerifyUrlOverride: string | undefined;
  readonly authCaptchaTurnstileSecretKey: Redacted.Redacted<string> | undefined;
  readonly authCaptchaTurnstileSiteKey: string | undefined;
  readonly authEmailFrom: Redacted.Redacted<string>;
  readonly authEmailFromName: string;
  readonly authPasswordCompromiseCheckEnabled: boolean | undefined;
  readonly authPasswordCompromiseCheckRangeUrlOverride: string | undefined;
  readonly authRateLimitCleanupEnabled: boolean | undefined;
  readonly authRateLimitEnabled: boolean;
  readonly authSecrets: Redacted.Redacted<string> | undefined;
  readonly googleMapsApiKey: Redacted.Redacted<InfraGoogleMapsApiKey>;
  readonly hyperdriveName: ProviderResourceName;
  readonly hyperdriveOriginConnectionLimit: number;
  readonly electricContainerInstanceType: ElectricContainerInstanceType;
  readonly electricStorageAccessKeyId: Redacted.Redacted<string> | undefined;
  readonly electricStorageSecretAccessKey:
    | Redacted.Redacted<string>
    | undefined;
  readonly mcpAuthorizedAppCacheMaxEntries: number | undefined;
  readonly mcpAuthorizedAppCacheTtlSeconds: number | undefined;
  readonly neonDatabaseName: string;
  readonly neonDefaultBranchName: string;
  readonly neonHistoryRetentionSeconds: number;
  readonly neonOrgId: string | undefined;
  readonly neonParentBranchProtected: boolean;
  readonly neonParentBranchName: string;
  readonly neonParentStage: string;
  readonly neonPgVersion: NeonPgVersion;
  readonly neonRegion: NeonRegion;
  readonly neonRoleName: string;
  readonly tenantBaseDomain: DomainName;
  readonly tenantHostMode: TenantHostMode;
  readonly tenantReservedHostnames: readonly DomainName[];
  readonly tenantRoutePattern: string | undefined;
  readonly tenantStageAlias: string | undefined;
  readonly tenantTrustedOriginPattern: string | undefined;
  readonly workerAnalyticsSampleRate: number;
}

export interface AlchemyStageIdentityInput {
  readonly appName?: string | undefined;
  readonly productionStage?: string | undefined;
  readonly stage: string;
}

export interface AlchemyStageIdentity {
  readonly appName: string;
  readonly isEphemeralCi: boolean;
  readonly isProduction: boolean;
  readonly isPullRequestPreview: boolean;
  readonly neonBranchName: string;
  readonly stage: string;
  readonly stageSlug: string;
}

const AuthEmailFromAddress = Schema.String.check(
  Schema.isPattern(emailAddressPattern, {
    message: "AUTH_EMAIL_FROM must be a plain email address",
  })
);
const AuthCaptchaTurnstileSecretKey = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/root-infra/AuthCaptchaTurnstileSecretKey")
);
const AuthCaptchaTurnstileSiteKey = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/root-infra/AuthCaptchaTurnstileSiteKey")
);
const AuthCaptchaSiteVerifyUrl = Schema.String.pipe(
  Schema.refine(
    (value): value is string => {
      try {
        const url = new URL(value.trim());
        return (
          (url.protocol === "http:" || url.protocol === "https:") &&
          isLoopbackHostname(url.hostname)
        );
      } catch {
        return false;
      }
    },
    {
      message:
        "AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE must be a local absolute HTTP(S) URL for test or development verifier stubs",
    }
  )
);
const AuthPasswordCompromiseCheckRangeUrl = Schema.String.pipe(
  Schema.refine(
    (value): value is string => {
      try {
        const url = new URL(value.trim());
        return (
          (url.protocol === "http:" || url.protocol === "https:") &&
          isLoopbackHostname(url.hostname)
        );
      } catch {
        return false;
      }
    },
    {
      message:
        "AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE must be a local absolute HTTP(S) URL for test or development range API stubs",
    }
  )
);
const betterAuthSecretMinLength = 32;
const BetterAuthSecretsValue = Schema.String.pipe(
  Schema.refine((value): value is string => isBetterAuthSecretsValue(value), {
    message:
      "BETTER_AUTH_SECRETS must be comma-delimited <version>:<secret> entries with unique non-negative integer versions and secrets of at least 32 characters",
  })
);
const HyperdriveOriginConnectionLimit = Schema.Int.check(
  Schema.isBetween(
    { minimum: 5, maximum: 100 },
    {
      message:
        "CEIRD_HYPERDRIVE_ORIGIN_CONNECTION_LIMIT must be an integer between 5 and 100",
    }
  )
);
const AgentActionRunStaleAfterSeconds = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1, {
    message:
      "CEIRD_AGENT_ACTION_RUN_STALE_AFTER_SECONDS must be a positive integer",
  })
);
const NeonHistoryRetentionSeconds = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0, {
    message:
      "CEIRD_NEON_HISTORY_RETENTION_SECONDS must be a non-negative integer",
  })
);
const WorkerAnalyticsSampleRate = Schema.Number.check(
  Schema.isBetween(
    { minimum: 0, maximum: 1 },
    {
      message:
        "CEIRD_WORKER_ANALYTICS_SAMPLE_RATE must be a number between 0 and 1",
    }
  )
);
export const NeonRegion = Schema.Literals([
  "aws-us-east-1",
  "aws-us-east-2",
  "aws-us-west-2",
  "aws-eu-central-1",
  "aws-eu-west-2",
  "aws-ap-southeast-1",
  "aws-ap-southeast-2",
  "aws-sa-east-1",
  "azure-eastus2",
  "azure-westus3",
  "azure-gwc",
]);
export type NeonRegion = Schema.Schema.Type<typeof NeonRegion>;

export const NeonPgVersion = Schema.Literals([14, 15, 16, 17, 18]);
export type NeonPgVersion = Schema.Schema.Type<typeof NeonPgVersion>;

function decodeAlchemyStage(value: string) {
  return Schema.decodeUnknownEffect(InfraStage)(value).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeDomainName(value: string) {
  return Schema.decodeUnknownEffect(DomainName)(value).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeProviderResourceName(value: string) {
  return Schema.decodeUnknownEffect(ProviderResourceName)(value).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeAuthEmailFrom(value: Redacted.Redacted<string>) {
  return Schema.decodeUnknownEffect(AuthEmailFromAddress)(
    Redacted.value(value)
  ).pipe(
    Effect.as(value),
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeAuthCaptchaTurnstileSecretKey(value: Redacted.Redacted<string>) {
  return Schema.decodeUnknownEffect(AuthCaptchaTurnstileSecretKey)(
    Redacted.value(value).trim()
  ).pipe(
    Effect.map((turnstileSecretKey) => Redacted.make(turnstileSecretKey)),
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeAuthCaptchaTurnstileSiteKey(value: string) {
  return Schema.decodeUnknownEffect(AuthCaptchaTurnstileSiteKey)(
    value.trim()
  ).pipe(Effect.mapError((error) => new Config.ConfigError(error)));
}

function decodeAuthCaptchaSiteVerifyUrl(value: string) {
  return Schema.decodeUnknownEffect(AuthCaptchaSiteVerifyUrl)(
    value.trim()
  ).pipe(Effect.mapError((error) => new Config.ConfigError(error)));
}

function decodeAuthPasswordCompromiseCheckRangeUrl(value: string) {
  return Schema.decodeUnknownEffect(AuthPasswordCompromiseCheckRangeUrl)(
    value.trim()
  ).pipe(Effect.mapError((error) => new Config.ConfigError(error)));
}

function decodeBetterAuthSecrets(value: Redacted.Redacted<string>) {
  return Schema.decodeUnknownEffect(BetterAuthSecretsValue)(
    Redacted.value(value)
  ).pipe(
    Effect.as(value),
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeGoogleMapsApiKey(value: Redacted.Redacted<string>) {
  return Schema.decodeUnknownEffect(InfraGoogleMapsApiKey)(
    Redacted.value(value).trim()
  ).pipe(
    Effect.map((googleMapsApiKey) => Redacted.make(googleMapsApiKey)),
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function validateBetterAuthSecrets(value: string) {
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length === 0) {
    throw new Error(
      "BETTER_AUTH_SECRETS must include at least one <version>:<secret> entry"
    );
  }

  const seenVersions = new Set<number>();

  for (const entry of entries) {
    const separatorIndex = entry.indexOf(":");

    if (separatorIndex <= 0) {
      throw new Error(
        "BETTER_AUTH_SECRETS entries must use <version>:<secret>"
      );
    }

    const version = Number(entry.slice(0, separatorIndex).trim());

    if (!Number.isInteger(version) || version < 0) {
      throw new Error(
        "BETTER_AUTH_SECRETS versions must be non-negative integers"
      );
    }

    if (seenVersions.has(version)) {
      throw new Error("BETTER_AUTH_SECRETS versions must be unique");
    }

    seenVersions.add(version);

    const secret = entry.slice(separatorIndex + 1).trim();

    if (secret.length < betterAuthSecretMinLength) {
      throw new Error(
        "BETTER_AUTH_SECRETS values must be at least 32 characters long"
      );
    }
  }
}

function isBetterAuthSecretsValue(value: string) {
  try {
    validateBetterAuthSecrets(value);
    return true;
  } catch {
    return false;
  }
}

function decodeHyperdriveOriginConnectionLimit(value: number) {
  return Schema.decodeUnknownEffect(HyperdriveOriginConnectionLimit)(
    value
  ).pipe(Effect.mapError((error) => new Config.ConfigError(error)));
}

function decodeAgentActionRunStaleAfterSeconds(value: number) {
  return Schema.decodeUnknownEffect(AgentActionRunStaleAfterSeconds)(
    value
  ).pipe(Effect.mapError((error) => new Config.ConfigError(error)));
}

function decodeNeonHistoryRetentionSeconds(value: number) {
  return Schema.decodeUnknownEffect(NeonHistoryRetentionSeconds)(value).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeWorkerAnalyticsSampleRate(value: number) {
  return Schema.decodeUnknownEffect(WorkerAnalyticsSampleRate)(value).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeNeonRegion(value: string) {
  return Schema.decodeUnknownEffect(NeonRegion)(value).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeNeonPgVersion(value: number) {
  return Schema.decodeUnknownEffect(NeonPgVersion)(value).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeElectricContainerInstanceType(value: string) {
  return Schema.decodeUnknownEffect(ElectricContainerInstanceType)(value).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function readOptionalNonEmptyRedactedConfig(name: string) {
  return Config.option(Config.redacted(name)).pipe(
    Effect.map((option) => {
      let result: Redacted.Redacted<string> | undefined;

      if (Option.isSome(option)) {
        const trimmed = Redacted.value(option.value).trim();

        if (trimmed.length > 0) {
          result = Redacted.make(trimmed);
        }
      }

      return result;
    })
  );
}

export function makeInfraConfigSourceError(message: string) {
  return new Config.ConfigError(new ConfigProvider.SourceError({ message }));
}

function validateElectricStorageCredentialPair(input: {
  readonly accessKeyId: Redacted.Redacted<string> | undefined;
  readonly secretAccessKey: Redacted.Redacted<string> | undefined;
}) {
  const hasAccessKey = input.accessKeyId !== undefined;
  const hasSecretKey = input.secretAccessKey !== undefined;

  return hasAccessKey === hasSecretKey
    ? Effect.void
    : Effect.fail(
        makeInfraConfigSourceError(
          "CEIRD_ELECTRIC_STORAGE_ACCESS_KEY_ID and CEIRD_ELECTRIC_STORAGE_SECRET_ACCESS_KEY must be configured together"
        )
      );
}

export function loadInfraStageConfig(stageInput: string) {
  return Effect.gen(function* () {
    const stage = yield* decodeAlchemyStage(stageInput);
    const zoneName = yield* Config.string("CEIRD_ZONE_NAME").pipe(
      Config.withDefault("ceird.app"),
      Config.mapOrFail(decodeDomainName)
    );
    const neonParentStage = yield* Config.string(
      "CEIRD_NEON_PARENT_STAGE"
    ).pipe(Config.withDefault("main"));
    const identity = makeAlchemyStageIdentity({
      appName: "ceird",
      productionStage: neonParentStage,
      stage,
    });
    const defaultAppHostname = `app.${identity.stageSlug}.${zoneName}`;
    const defaultApiHostname = `api.${identity.stageSlug}.${zoneName}`;
    const defaultAgentHostname = `agent.${identity.stageSlug}.${zoneName}`;
    const defaultMcpHostname = `mcp.${identity.stageSlug}.${zoneName}`;
    const defaultSyncHostname = `sync.${identity.stageSlug}.${zoneName}`;
    const defaultHyperdriveName = identity.isProduction
      ? `${identity.appName}-production-postgres`
      : stageResourceName(identity, "postgres");
    const appHostname = yield* Config.string("CEIRD_APP_HOSTNAME").pipe(
      Config.withDefault(defaultAppHostname),
      Config.mapOrFail(decodeDomainName)
    );
    const apiHostname = yield* Config.string("CEIRD_API_HOSTNAME").pipe(
      Config.withDefault(defaultApiHostname),
      Config.mapOrFail(decodeDomainName)
    );
    const agentHostname = yield* Config.string("CEIRD_AGENT_HOSTNAME").pipe(
      Config.withDefault(defaultAgentHostname),
      Config.mapOrFail(decodeDomainName)
    );
    const mcpHostname = yield* Config.string("CEIRD_MCP_HOSTNAME").pipe(
      Config.withDefault(defaultMcpHostname),
      Config.mapOrFail(decodeDomainName)
    );
    const syncHostname = yield* Config.string("CEIRD_SYNC_HOSTNAME").pipe(
      Config.withDefault(defaultSyncHostname),
      Config.mapOrFail(decodeDomainName)
    );
    const tenantBaseDomain = zoneName;
    const tenantHostMode = resolveTenantHostMode({
      agentHostname,
      appHostname,
      apiHostname,
      identity,
      mcpHostname,
      syncHostname,
      zoneName,
    });
    const tenantStageAlias =
      tenantHostMode === "stage" ? makeTenantStageAlias(identity) : undefined;
    const tenantRoutePattern = makeTenantRoutePattern({
      mode: tenantHostMode,
      stageAlias: tenantStageAlias,
      zoneName,
    });
    const tenantTrustedOriginPattern = makeTenantTrustedOriginPattern({
      mode: tenantHostMode,
      stageAlias: tenantStageAlias,
      zoneName,
    });
    const tenantReservedHostnames = [
      appHostname,
      apiHostname,
      agentHostname,
      mcpHostname,
      syncHostname,
    ];
    const authCookiePrefix = makeAuthCookiePrefix(identity);
    const authCookieDomain = tenantBaseDomain;
    const authCaptchaEnabled = yield* Config.option(
      Config.boolean("AUTH_CAPTCHA_ENABLED")
    ).pipe(Effect.map(Option.getOrUndefined));
    const authCaptchaTurnstileSecretKey = yield* Config.option(
      Config.redacted("AUTH_CAPTCHA_TURNSTILE_SECRET_KEY").pipe(
        Config.mapOrFail(decodeAuthCaptchaTurnstileSecretKey)
      )
    ).pipe(Effect.map(Option.getOrUndefined));
    const authCaptchaTurnstileSiteKey = yield* Config.option(
      Config.string("AUTH_CAPTCHA_TURNSTILE_SITE_KEY").pipe(
        Config.mapOrFail(decodeAuthCaptchaTurnstileSiteKey)
      )
    ).pipe(Effect.map(Option.getOrUndefined));
    const authCaptchaSiteVerifyUrlOverride = yield* Config.option(
      Config.string("AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE").pipe(
        Config.mapOrFail(decodeAuthCaptchaSiteVerifyUrl)
      )
    ).pipe(Effect.map(Option.getOrUndefined));

    if (
      authCaptchaEnabled === true &&
      authCaptchaTurnstileSecretKey === undefined
    ) {
      throw new Error(
        "AUTH_CAPTCHA_TURNSTILE_SECRET_KEY is required when AUTH_CAPTCHA_ENABLED is true"
      );
    }

    if (
      authCaptchaEnabled === true &&
      authCaptchaTurnstileSiteKey === undefined
    ) {
      throw new Error(
        "AUTH_CAPTCHA_TURNSTILE_SITE_KEY is required when AUTH_CAPTCHA_ENABLED is true"
      );
    }

    const authEmailFrom = yield* Config.redacted("AUTH_EMAIL_FROM").pipe(
      Config.mapOrFail(decodeAuthEmailFrom)
    );
    const authEmailFromName = yield* Config.string("AUTH_EMAIL_FROM_NAME").pipe(
      Config.withDefault("Ceird")
    );
    const authPasswordCompromiseCheckEnabled = yield* Config.option(
      Config.boolean("AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED")
    ).pipe(Effect.map(Option.getOrUndefined));
    const authPasswordCompromiseCheckRangeUrlOverride = yield* Config.option(
      Config.string("AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE").pipe(
        Config.mapOrFail(decodeAuthPasswordCompromiseCheckRangeUrl)
      )
    ).pipe(Effect.map(Option.getOrUndefined));
    const authRateLimitEnabled = yield* Config.boolean(
      "AUTH_RATE_LIMIT_ENABLED"
    ).pipe(Config.withDefault(!identity.isPullRequestPreview));
    const authRateLimitCleanupEnabled = yield* Config.option(
      Config.boolean("AUTH_RATE_LIMIT_CLEANUP_ENABLED")
    ).pipe(Effect.map(Option.getOrUndefined));
    const authSecrets = yield* Config.option(
      Config.redacted("BETTER_AUTH_SECRETS").pipe(
        Config.mapOrFail(decodeBetterAuthSecrets)
      )
    ).pipe(Effect.map(Option.getOrUndefined));
    const agentActionRunStaleAfterSeconds = yield* Config.number(
      "CEIRD_AGENT_ACTION_RUN_STALE_AFTER_SECONDS"
    ).pipe(
      Config.withDefault(15 * 60),
      Config.mapOrFail(decodeAgentActionRunStaleAfterSeconds)
    );
    const googleMapsApiKey = yield* Config.redacted("GOOGLE_MAPS_API_KEY").pipe(
      Config.mapOrFail(decodeGoogleMapsApiKey)
    );
    const hyperdriveName = yield* Config.string("CEIRD_HYPERDRIVE_NAME").pipe(
      Config.withDefault(defaultHyperdriveName),
      Config.mapOrFail(decodeProviderResourceName)
    );
    const hyperdriveOriginConnectionLimit = yield* Config.number(
      "CEIRD_HYPERDRIVE_ORIGIN_CONNECTION_LIMIT"
    ).pipe(
      Config.withDefault(5),
      Config.mapOrFail(decodeHyperdriveOriginConnectionLimit)
    );
    const workerAnalyticsSampleRate = yield* Config.number(
      "CEIRD_WORKER_ANALYTICS_SAMPLE_RATE"
    ).pipe(
      Config.withDefault(0.1),
      Config.mapOrFail(decodeWorkerAnalyticsSampleRate)
    );
    const electricContainerInstanceType = yield* Config.string(
      "CEIRD_ELECTRIC_CONTAINER_INSTANCE_TYPE"
    ).pipe(
      Config.withDefault(identity.isProduction ? "basic" : "dev"),
      Config.mapOrFail(decodeElectricContainerInstanceType)
    );
    const electricStorageAccessKeyId =
      yield* readOptionalNonEmptyRedactedConfig(
        "CEIRD_ELECTRIC_STORAGE_ACCESS_KEY_ID"
      );
    const electricStorageSecretAccessKey =
      yield* readOptionalNonEmptyRedactedConfig(
        "CEIRD_ELECTRIC_STORAGE_SECRET_ACCESS_KEY"
      );
    yield* validateElectricStorageCredentialPair({
      accessKeyId: electricStorageAccessKeyId,
      secretAccessKey: electricStorageSecretAccessKey,
    });
    const mcpAuthorizedAppCacheMaxEntries = yield* Config.option(
      Config.int("CEIRD_MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES").pipe(
        Config.mapOrFail(
          decodeMcpAuthorizedAppCacheConfigInteger(
            "CEIRD_MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES"
          )
        )
      )
    ).pipe(Effect.map(Option.getOrUndefined));
    const mcpAuthorizedAppCacheTtlSeconds = yield* Config.option(
      Config.int("CEIRD_MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS").pipe(
        Config.mapOrFail(
          decodeMcpAuthorizedAppCacheConfigInteger(
            "CEIRD_MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS"
          )
        )
      )
    ).pipe(Effect.map(Option.getOrUndefined));
    const neonDatabaseName = yield* Config.string(
      "CEIRD_NEON_DATABASE_NAME"
    ).pipe(Config.withDefault("ceird"));
    const neonDefaultBranchName = yield* Config.string(
      "CEIRD_NEON_DEFAULT_BRANCH_NAME"
    ).pipe(Config.withDefault("base"));
    const neonHistoryRetentionSeconds = yield* Config.number(
      "CEIRD_NEON_HISTORY_RETENTION_SECONDS"
    ).pipe(
      Config.withDefault(21_600),
      Config.mapOrFail(decodeNeonHistoryRetentionSeconds)
    );
    const neonOrgIdOption = yield* Config.option(
      Config.string("NEON_ORG_ID").pipe(Config.map((value) => value.trim()))
    );
    const neonOrgId = yield* Option.match(neonOrgIdOption, {
      onNone: () => Effect.succeed(Option.none<string>()),
      onSome: (value) =>
        value.length > 0
          ? Effect.succeed(Option.some(value))
          : Effect.succeed(Option.none<string>()),
    }).pipe(Effect.map(Option.getOrUndefined));
    const neonParentBranchProtected = yield* Config.boolean(
      "CEIRD_NEON_PARENT_BRANCH_PROTECTED"
    ).pipe(Config.withDefault(false));
    const neonParentBranchName = yield* Config.string(
      "CEIRD_NEON_PARENT_BRANCH_NAME"
    ).pipe(Config.withDefault("main"));
    const neonPgVersion = yield* Config.number("CEIRD_NEON_PG_VERSION").pipe(
      Config.withDefault(17),
      Config.mapOrFail(decodeNeonPgVersion)
    );
    const neonRegion = yield* Config.string("CEIRD_NEON_REGION").pipe(
      Config.withDefault("aws-eu-west-2"),
      Config.mapOrFail(decodeNeonRegion)
    );
    const neonRoleName = yield* Config.string("CEIRD_NEON_ROLE_NAME").pipe(
      Config.withDefault("ceird")
    );

    return {
      appName: "ceird",
      agentActionRunStaleAfterSeconds,
      stage,
      zoneName,
      appHostname,
      apiHostname,
      agentHostname,
      mcpHostname,
      syncHostname,
      authCookiePrefix,
      authCookieDomain,
      authCaptchaEnabled,
      authCaptchaSiteVerifyUrlOverride,
      authCaptchaTurnstileSecretKey,
      authCaptchaTurnstileSiteKey,
      authEmailFrom,
      authEmailFromName,
      authPasswordCompromiseCheckEnabled,
      authPasswordCompromiseCheckRangeUrlOverride,
      authRateLimitCleanupEnabled,
      authRateLimitEnabled,
      authSecrets,
      googleMapsApiKey,
      hyperdriveName,
      hyperdriveOriginConnectionLimit,
      electricContainerInstanceType,
      electricStorageAccessKeyId,
      electricStorageSecretAccessKey,
      mcpAuthorizedAppCacheMaxEntries,
      mcpAuthorizedAppCacheTtlSeconds,
      neonDatabaseName,
      neonDefaultBranchName,
      neonHistoryRetentionSeconds,
      neonOrgId,
      neonParentBranchProtected,
      neonParentBranchName,
      neonParentStage,
      neonPgVersion,
      neonRegion,
      neonRoleName,
      tenantBaseDomain,
      tenantHostMode,
      tenantReservedHostnames,
      tenantRoutePattern,
      tenantStageAlias,
      tenantTrustedOriginPattern,
      workerAnalyticsSampleRate,
    } satisfies InfraStageConfig;
  });
}

export function resourceName(config: InfraStageConfig, suffix: string) {
  return stageResourceName(
    makeAlchemyStageIdentity({
      appName: config.appName,
      stage: config.stage,
    }),
    suffix
  );
}

export function makeAlchemyStageIdentity(
  input: AlchemyStageIdentityInput
): AlchemyStageIdentity {
  const appName = input.appName ?? "ceird";
  const stage = input.stage.trim();
  const stageSlug = makeStageSlug(stage);
  const productionStage = input.productionStage ?? "main";

  return {
    appName,
    isEphemeralCi: /^ci-\d+-\d+$/.test(stage),
    isProduction: stage === productionStage,
    isPullRequestPreview: /^pr-\d+$/.test(stage),
    neonBranchName: stageSlug,
    stage,
    stageSlug,
  };
}

export function stageResourceName(
  identity: AlchemyStageIdentity,
  suffix: string
) {
  return [identity.appName, identity.stageSlug, makeStageSlug(suffix)].join(
    "-"
  );
}

function makeStageSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .replaceAll(/-{2,}/g, "-");
  const base = slug.length > 0 ? slug : "stage";

  if (base.length <= maxStageSlugLength) {
    return base;
  }

  const hash = createHash("sha256").update(value).digest("hex").slice(0, 8);
  const prefix = base
    .slice(0, maxStageSlugLength - hash.length - 1)
    .replaceAll(/-+$/g, "");

  return `${prefix}-${hash}`;
}

const maxTenantStageAliasLength = 14;

function makeTenantStageAlias(identity: AlchemyStageIdentity) {
  if (identity.stageSlug.length <= maxTenantStageAliasLength) {
    return identity.stageSlug;
  }

  const hash = createHash("sha256")
    .update(identity.stage)
    .digest("hex")
    .slice(0, 12);

  return `s-${hash}`;
}

function makeAuthCookiePrefix(identity: AlchemyStageIdentity) {
  return `ceird-${identity.stageSlug}`.slice(0, 48);
}

function resolveTenantHostMode(input: {
  readonly agentHostname: string;
  readonly appHostname: string;
  readonly apiHostname: string;
  readonly identity: AlchemyStageIdentity;
  readonly mcpHostname: string;
  readonly syncHostname: string;
  readonly zoneName: string;
}): TenantHostMode {
  if (
    input.identity.isProduction &&
    input.agentHostname === `agent.${input.zoneName}` &&
    input.apiHostname === `api.${input.zoneName}` &&
    input.appHostname === `app.${input.zoneName}` &&
    input.mcpHostname === `mcp.${input.zoneName}` &&
    input.syncHostname === `sync.${input.zoneName}`
  ) {
    return "production";
  }

  return "stage";
}

function makeTenantRoutePattern(input: {
  readonly mode: TenantHostMode;
  readonly stageAlias: string | undefined;
  readonly zoneName: string;
}) {
  if (input.mode === "production") {
    return `*.${input.zoneName}/*`;
  }

  if (input.mode === "stage" && input.stageAlias) {
    return `*--${input.stageAlias}.${input.zoneName}/*`;
  }
}

function makeTenantTrustedOriginPattern(input: {
  readonly mode: TenantHostMode;
  readonly stageAlias: string | undefined;
  readonly zoneName: string;
}) {
  if (input.mode === "production") {
    return `https://*.${input.zoneName}`;
  }

  if (input.mode === "stage" && input.stageAlias) {
    return `https://*--${input.stageAlias}.${input.zoneName}`;
  }
}
