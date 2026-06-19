import { Layer, Context, Config, Effect, Option, Schema, pipe } from "effect";

import {
  DEFAULT_APP_DATABASE_URL,
  appDatabaseUrlConfig,
} from "../../../platform/database/config.js";
import type { FetchPasswordRange } from "./auth-password-compromise.js";
import {
  loadRateLimitCleanupConfig,
  makeRateLimitCleanupConfig,
} from "./auth-rate-limit-cleanup.js";
import type { RateLimitCleanupConfig } from "./auth-rate-limit-cleanup.js";

export const DEFAULT_AUTH_BASE_PATH = "/api/auth" as const;
export const DEFAULT_AUTH_DATABASE_URL = DEFAULT_APP_DATABASE_URL;
export const DEFAULT_MCP_RESOURCE_PATH = "/mcp" as const;
export const DEFAULT_OAUTH_CONSENT_PATH = "/oauth/consent" as const;
export const AUTH_CAPTCHA_PROVIDER = "cloudflare-turnstile" as const;
export const AUTH_CAPTCHA_PROTECTED_ENDPOINTS = [
  "/sign-up/email",
  "/request-password-reset",
  "/send-verification-email",
] as const;
export const AUTH_PASSWORD_MIN_LENGTH = 12 as const;
export const AUTH_PASSWORD_MAX_LENGTH = 256 as const;
export const CEIRD_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "ceird:read",
  "ceird:write",
  "ceird:admin",
] as const;
export type CeirdOAuthScope = (typeof CEIRD_OAUTH_SCOPES)[number];
export const CEIRD_OAUTH_CLIENT_REGISTRATION_DEFAULT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "ceird:read",
] as const satisfies readonly CeirdOAuthScope[];
export const CEIRD_OAUTH_CLIENT_REGISTRATION_ALLOWED_SCOPES =
  CEIRD_OAUTH_CLIENT_REGISTRATION_DEFAULT_SCOPES;
export type CeirdOAuthClientRegistrationAllowedScope =
  (typeof CEIRD_OAUTH_CLIENT_REGISTRATION_ALLOWED_SCOPES)[number];
const TrustedOriginPattern = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(
      /^https?:\/\/(?:[a-z0-9-]+|\*[a-z0-9-]*)(?:\.(?:[a-z0-9-]+|\*[a-z0-9-]*))*(?::\d+)?$/i
    )
  ),
  Schema.brand("TrustedOriginPattern")
);
const CookieDomain = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
    )
  ),
  Schema.brand("CookieDomain")
);

export type TrustedOriginPattern = Schema.Schema.Type<
  typeof TrustedOriginPattern
>;

const decodeTrustedOriginPattern =
  Schema.decodeUnknownSync(TrustedOriginPattern);
const decodeCookieDomain = Schema.decodeUnknownSync(CookieDomain);

function makeTrustedOriginPattern(value: string): TrustedOriginPattern {
  return decodeTrustedOriginPattern(value);
}

function makeCookieDomain(value: string): string {
  try {
    return decodeCookieDomain(value);
  } catch {
    throw new Error(
      "AUTH_COOKIE_DOMAIN must be a valid parent domain without protocol, path, port, or wildcard"
    );
  }
}

export function matchesTrustedOrigin(
  origin: string,
  trustedOrigins: readonly string[]
) {
  return trustedOrigins.some((pattern) => {
    if (!pattern.includes("*") && !pattern.includes("?")) {
      return pattern === origin;
    }

    const escapedPattern = pattern.replaceAll(/[.+^${}()|[\]\\]/g, "\\$&");
    const matcher = escapedPattern
      .replaceAll("*", "[^.]+")
      .replaceAll("?", "[^.]");

    return new RegExp(`^${matcher}$`).test(origin);
  });
}

const DEFAULT_LOCAL_APP_ORIGIN_STRINGS = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
] as const;

const DEFAULT_LOCAL_APP_ORIGINS = DEFAULT_LOCAL_APP_ORIGIN_STRINGS.map(
  makeTrustedOriginPattern
);
export const authenticationDatabaseUrlConfig = appDatabaseUrlConfig;
const AbsoluteUrlString = (name: string) =>
  Schema.String.pipe(
    Schema.refine(
      (value): value is string => {
        try {
          const url = new URL(value);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      },
      {
        message: `${name} must be a valid absolute URL`,
      }
    )
  );
const authenticationBaseUrlConfig = Config.schema(
  AbsoluteUrlString("BETTER_AUTH_BASE_URL"),
  "BETTER_AUTH_BASE_URL"
);
const absoluteUrlConfig = (name: string) =>
  Config.schema(AbsoluteUrlString(name), name);
const AuthenticationSecretValue = Schema.String.pipe(
  Schema.refine((value): value is string => value.length >= 32, {
    message: "Better Auth secrets must be at least 32 characters long",
  })
);
const AuthenticationCaptchaSecretValue = Schema.String.pipe(
  Schema.refine((value): value is string => value.trim().length > 0, {
    message:
      "AUTH_CAPTCHA_TURNSTILE_SECRET_KEY must be a non-empty Cloudflare Turnstile secret",
  })
);
const AuthenticationCaptchaSiteVerifyURLOverride = Schema.String.pipe(
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
const decodeAuthenticationCaptchaSiteVerifyURLOverride =
  Schema.decodeUnknownSync(AuthenticationCaptchaSiteVerifyURLOverride);
const AuthenticationPasswordCompromiseCheckRangeURLOverride =
  Schema.String.pipe(
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
const decodeAuthenticationPasswordCompromiseCheckRangeURLOverride =
  Schema.decodeUnknownSync(
    AuthenticationPasswordCompromiseCheckRangeURLOverride
  );
const AuthenticationVersionedSecretsValue = Schema.String.pipe(
  Schema.refine(
    (value): value is string => isAuthenticationVersionedSecretsValue(value),
    {
      message:
        "BETTER_AUTH_SECRETS must be comma-delimited <version>:<secret> entries with unique non-negative integer versions and secrets of at least 32 characters",
    }
  )
);

const authenticationMcpResourceUrlConfig = absoluteUrlConfig(
  "MCP_RESOURCE_URL"
).pipe(Config.option);
const oauthIssuerUrlConfig = absoluteUrlConfig("OAUTH_ISSUER_URL").pipe(
  Config.option
);

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

  const { high: highSegment, low: lowSegment } = hexMappedIPv4Match.groups;

  if (highSegment === undefined || lowSegment === undefined) {
    return false;
  }

  const high = Number.parseInt(highSegment, 16);
  const low = Number.parseInt(lowSegment, 16);

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

function normalizeOAuthIssuerUrl(value: string) {
  const url = new URL(value);

  if (url.protocol !== "https:" && !isLoopbackHostname(url.hostname)) {
    url.protocol = "https:";
  }

  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/$/, "");
}

export interface AuthenticationEnvironment {
  readonly appOrigin?: string | undefined;
  readonly baseUrl: string;
  readonly captchaEnabled?: boolean | undefined;
  readonly captchaSiteVerifyURLOverride?: string | undefined;
  readonly captchaTurnstileSecretKey?: string | undefined;
  readonly cookieDomain?: string | undefined;
  readonly cookiePrefix?: string | undefined;
  readonly mcpResourceUrl?: string | undefined;
  readonly oauthIssuerUrl?: string | undefined;
  readonly oauthClientRegistrationAllowLoopbackRedirects?: boolean | undefined;
  readonly passwordCompromiseCheckEnabled?: boolean | undefined;
  readonly passwordCompromiseCheckFetchPasswordRange?:
    | FetchPasswordRange
    | undefined;
  readonly passwordCompromiseCheckRequestTimeoutMs?: number | undefined;
  readonly secret: string;
  readonly secrets?: AuthenticationVersionedSecret[] | undefined;
  readonly databaseUrl: string;
  readonly rateLimitEnabled?: boolean | undefined;
  readonly rateLimitCleanupBatchSize?: number | undefined;
  readonly rateLimitCleanupEnabled?: boolean | undefined;
  readonly rateLimitCleanupMaxBatches?: number | undefined;
  readonly rateLimitCleanupRetentionHours?: number | undefined;
  readonly trustedOrigins?: readonly string[] | undefined;
}

export interface AuthenticationVersionedSecret {
  readonly version: number;
  readonly value: string;
}

export interface AuthenticationConfig {
  readonly appName: "Ceird";
  readonly basePath: typeof DEFAULT_AUTH_BASE_PATH;
  readonly baseURL: string;
  readonly trustedOrigins: TrustedOriginPattern[];
  readonly secret: string;
  readonly secrets?: { version: number; value: string }[];
  readonly databaseUrl: string;
  readonly advanced?: {
    readonly trustedProxyHeaders: true;
    readonly ipAddress: {
      readonly ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"];
    };
    readonly cookiePrefix?: string;
    readonly crossSubDomainCookies?: {
      readonly enabled: true;
      readonly domain: string;
    };
  };
  readonly rateLimit: {
    readonly enabled: boolean;
    readonly storage: "database";
    readonly customRules: {
      readonly "/sign-in/email": {
        readonly window: 60;
        readonly max: 5;
      };
      readonly "/sign-up/email": {
        readonly window: 60;
        readonly max: 3;
      };
      readonly "/request-password-reset": {
        readonly window: 60;
        readonly max: 3;
      };
      readonly "/send-verification-email": {
        readonly window: 60;
        readonly max: 3;
      };
      readonly "/change-email": {
        readonly window: 60;
        readonly max: 3;
      };
      readonly "/change-password": {
        readonly window: 60;
        readonly max: 5;
      };
      readonly "/two-factor/send-otp": {
        readonly window: 60;
        readonly max: 3;
      };
      readonly "/two-factor/verify-backup-code": {
        readonly window: 60;
        readonly max: 5;
      };
      readonly "/two-factor/verify-otp": {
        readonly window: 60;
        readonly max: 5;
      };
      readonly "/two-factor/verify-totp": {
        readonly window: 60;
        readonly max: 5;
      };
      readonly "/organization/invite-member": {
        readonly window: 3600;
        readonly max: 30;
      };
      readonly "/oauth2/register": {
        readonly window: 60;
        readonly max: 5;
      };
    };
  };
  readonly rateLimitCleanup: RateLimitCleanupConfig;
  readonly captcha:
    | {
        readonly enabled: false;
        readonly provider: typeof AUTH_CAPTCHA_PROVIDER;
        readonly protectedEndpoints: typeof AUTH_CAPTCHA_PROTECTED_ENDPOINTS;
        readonly siteVerifyURLOverride?: string | undefined;
      }
    | {
        readonly enabled: true;
        readonly provider: typeof AUTH_CAPTCHA_PROVIDER;
        readonly protectedEndpoints: typeof AUTH_CAPTCHA_PROTECTED_ENDPOINTS;
        readonly secretKey: string;
        readonly siteVerifyURLOverride?: string | undefined;
      };
  readonly emailAndPassword: {
    readonly enabled: true;
    readonly minPasswordLength: typeof AUTH_PASSWORD_MIN_LENGTH;
    readonly maxPasswordLength: typeof AUTH_PASSWORD_MAX_LENGTH;
    readonly revokeSessionsOnPasswordReset: true;
  };
  readonly emailVerification: {
    readonly autoSignInAfterVerification: false;
    readonly expiresIn: 3600;
    readonly sendOnSignIn: false;
    readonly sendOnSignUp: true;
  };
  readonly user: {
    readonly additionalFields: {
      readonly twoFactorEnabled: {
        readonly type: "boolean";
        readonly required: false;
        readonly defaultValue: false;
        readonly input: false;
      };
    };
    readonly changeEmail: {
      readonly enabled: true;
    };
  };
  readonly passwordCompromiseCheck: {
    readonly enabled: boolean;
    readonly failOpen: true;
    readonly fetchPasswordRange?: FetchPasswordRange | undefined;
    readonly requestTimeoutMs?: number | undefined;
  };
  readonly mcpResourceUrl: string;
  readonly oauthIssuerUrl: string;
  readonly oauthClientRegistrationAllowLoopbackRedirects: boolean;
  readonly oauthConsentPath: typeof DEFAULT_OAUTH_CONSENT_PATH;
  readonly oauthScopes: typeof CEIRD_OAUTH_SCOPES;
  readonly oauthClientRegistrationAllowedScopes: typeof CEIRD_OAUTH_CLIENT_REGISTRATION_ALLOWED_SCOPES;
  readonly oauthClientRegistrationDefaultScopes: typeof CEIRD_OAUTH_CLIENT_REGISTRATION_DEFAULT_SCOPES;
}

export class AuthenticationConfigService extends Context.Service<AuthenticationConfigService>()(
  "@ceird/domains/identity/authentication/AuthenticationConfigService",
  {
    make: Effect.gen(function* AuthenticationConfigServiceEffect() {
      return yield* loadAuthenticationConfig;
    }),
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    AuthenticationConfigService,
    AuthenticationConfigService.make
  );
  static readonly Default =
    AuthenticationConfigService.DefaultWithoutDependencies;
}

interface OriginParts {
  readonly hostname: string;
  readonly protocol: string;
}

function readOriginParts(value: string | undefined): OriginParts | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    return {
      hostname: url.hostname,
      protocol: url.protocol,
    };
  } catch {
    return undefined;
  }
}

function isLocalhostDomain(hostname: string) {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

function findSharedDomain(firstHostname: string, secondHostname: string) {
  const firstLabels = firstHostname.split(".").filter(Boolean);
  const secondLabels = secondHostname.split(".").filter(Boolean);

  if (
    firstLabels.length < 3 ||
    secondLabels.length < 3 ||
    firstLabels[0] !== "api" ||
    secondLabels[0] !== "app"
  ) {
    return;
  }

  firstLabels.shift();
  secondLabels.shift();
  const sharedLabels: string[] = [];

  while (firstLabels.length > 0 && secondLabels.length > 0) {
    const firstLabel = firstLabels.pop();
    const secondLabel = secondLabels.pop();

    if (firstLabel !== secondLabel || firstLabel === undefined) {
      break;
    }

    sharedLabels.unshift(firstLabel);
  }

  return sharedLabels.length >= 2 ? sharedLabels.join(".") : undefined;
}

function hostnameMatchesCookieDomain(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function resolveExplicitCookieDomain(
  environment: Pick<
    AuthenticationEnvironment,
    "appOrigin" | "baseUrl" | "cookieDomain"
  >
) {
  if (!environment.cookieDomain) {
    return;
  }

  const cookieDomain = makeCookieDomain(environment.cookieDomain);
  const base = readOriginParts(environment.baseUrl);
  const app = readOriginParts(environment.appOrigin);

  if (!base || !hostnameMatchesCookieDomain(base.hostname, cookieDomain)) {
    throw new Error(
      "AUTH_COOKIE_DOMAIN must match the BETTER_AUTH_BASE_URL hostname"
    );
  }

  if (app && !hostnameMatchesCookieDomain(app.hostname, cookieDomain)) {
    throw new Error(
      "AUTH_COOKIE_DOMAIN must match the AUTH_APP_ORIGIN hostname"
    );
  }

  return cookieDomain;
}

export function resolveCrossSubDomainCookieDomain(
  environment: Pick<AuthenticationEnvironment, "appOrigin" | "baseUrl">
): string | undefined {
  const base = readOriginParts(environment.baseUrl);
  const app = readOriginParts(environment.appOrigin);

  if (
    !base ||
    !app ||
    base.protocol !== "https:" ||
    app.protocol !== "https:" ||
    isLoopbackHostname(base.hostname) ||
    isLoopbackHostname(app.hostname) ||
    isLocalhostDomain(base.hostname) ||
    isLocalhostDomain(app.hostname)
  ) {
    return;
  }

  return findSharedDomain(base.hostname, app.hostname);
}

export function makeAuthenticationTrustedOrigins(
  environment: Pick<AuthenticationEnvironment, "appOrigin" | "trustedOrigins">
): TrustedOriginPattern[] {
  const trustedOrigins = new Set<TrustedOriginPattern>(
    DEFAULT_LOCAL_APP_ORIGINS
  );

  if (environment.appOrigin) {
    try {
      trustedOrigins.add(
        makeTrustedOriginPattern(new URL(environment.appOrigin).origin)
      );
    } catch {
      // Ignore malformed AUTH_APP_ORIGIN values and keep the default trusted origins.
    }
  }

  for (const trustedOrigin of environment.trustedOrigins ?? []) {
    trustedOrigins.add(makeTrustedOriginPattern(trustedOrigin));
  }

  return [...trustedOrigins];
}

function makeDefaultMcpResourceUrl(
  environment: Pick<AuthenticationEnvironment, "baseUrl">
) {
  const url = new URL(environment.baseUrl);
  return new URL(DEFAULT_MCP_RESOURCE_PATH, url.origin).toString();
}

function parseAuthenticationVersionedSecrets(
  value: string | undefined
): AuthenticationVersionedSecret[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length === 0) {
    return undefined;
  }

  const seenVersions = new Set<number>();

  return entries
    .map((entry) => {
      const separatorIndex = entry.indexOf(":");

      if (separatorIndex <= 0) {
        throw new Error(
          "BETTER_AUTH_SECRETS entries must use <version>:<secret>"
        );
      }

      const versionText = entry.slice(0, separatorIndex).trim();
      const version = Number(versionText);

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

      try {
        Schema.decodeUnknownSync(AuthenticationSecretValue)(secret);
      } catch {
        throw new Error(
          "BETTER_AUTH_SECRETS values must be at least 32 characters long"
        );
      }

      return {
        version,
        value: secret,
      };
    })
    .toSorted((left, right) => right.version - left.version);
}

function isAuthenticationVersionedSecretsValue(value: string) {
  try {
    parseAuthenticationVersionedSecrets(value);
    return true;
  } catch {
    return false;
  }
}

function decodeAuthenticationVersionedSecrets(value: string) {
  return Schema.decodeUnknownEffect(AuthenticationVersionedSecretsValue)(
    value
  ).pipe(
    Effect.map((decodedValue) =>
      parseAuthenticationVersionedSecrets(decodedValue)
    ),
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeAuthenticationCaptchaSiteVerifyURLOverrideConfig(value: string) {
  return Schema.decodeUnknownEffect(AuthenticationCaptchaSiteVerifyURLOverride)(
    value.trim()
  ).pipe(Effect.mapError((error) => new Config.ConfigError(error)));
}

function decodeAuthenticationPasswordCompromiseCheckRangeURLOverrideConfig(
  value: string
) {
  return Schema.decodeUnknownEffect(
    AuthenticationPasswordCompromiseCheckRangeURLOverride
  )(value.trim()).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function normalizeAuthenticationVersionedSecrets(
  secrets: readonly AuthenticationVersionedSecret[] | undefined
) {
  return secrets
    ?.map((secret) => ({
      version: secret.version,
      value: secret.value,
    }))
    .toSorted((left, right) => right.version - left.version);
}

function normalizeAuthenticationCaptchaSiteVerifyURLOverride(
  value: string | undefined
) {
  if (value === undefined) {
    return;
  }

  try {
    return decodeAuthenticationCaptchaSiteVerifyURLOverride(value.trim());
  } catch {
    throw new Error(
      "AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE must be a local absolute HTTP(S) URL for test or development verifier stubs"
    );
  }
}

function normalizeAuthenticationPasswordCompromiseCheckRangeURLOverride(
  value: string | undefined
) {
  if (value === undefined) {
    return;
  }

  try {
    const url = new URL(
      decodeAuthenticationPasswordCompromiseCheckRangeURLOverride(value.trim())
    );
    url.search = "";
    url.hash = "";

    return `${url.toString().replace(/\/$/, "")}/`;
  } catch {
    throw new Error(
      "AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE must be a local absolute HTTP(S) URL for test or development range API stubs"
    );
  }
}

function makePasswordCompromiseCheckRangeURLOverrideFetcher(
  rangeURLOverride: string
): FetchPasswordRange {
  const normalizedRangeURLOverride =
    normalizeAuthenticationPasswordCompromiseCheckRangeURLOverride(
      rangeURLOverride
    );

  if (normalizedRangeURLOverride === undefined) {
    throw new Error(
      "AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE must be configured before creating a range API override fetcher"
    );
  }

  return async (prefix, options) => {
    const response = await fetch(
      new URL(encodeURIComponent(prefix), normalizedRangeURLOverride),
      {
        headers: {
          "Add-Padding": "true",
          "User-Agent": "Ceird Password Checker",
        },
        signal: options?.signal,
      }
    );

    if (!response.ok) {
      throw new Error(
        `HIBP range override request failed with status ${response.status}`
      );
    }

    return response.text();
  };
}

function makeAuthenticationCaptchaConfig(
  environment: Pick<
    AuthenticationEnvironment,
    | "captchaEnabled"
    | "captchaSiteVerifyURLOverride"
    | "captchaTurnstileSecretKey"
  >
): AuthenticationConfig["captcha"] {
  const siteVerifyURLOverride =
    normalizeAuthenticationCaptchaSiteVerifyURLOverride(
      environment.captchaSiteVerifyURLOverride
    );

  if (environment.captchaEnabled !== true) {
    return {
      enabled: false,
      provider: AUTH_CAPTCHA_PROVIDER,
      protectedEndpoints: AUTH_CAPTCHA_PROTECTED_ENDPOINTS,
      ...(siteVerifyURLOverride === undefined
        ? {}
        : {
            siteVerifyURLOverride,
          }),
    };
  }

  const secretKey = environment.captchaTurnstileSecretKey?.trim();

  if (!secretKey) {
    throw new Error(
      "AUTH_CAPTCHA_TURNSTILE_SECRET_KEY is required when AUTH_CAPTCHA_ENABLED is true"
    );
  }

  return {
    enabled: true,
    provider: AUTH_CAPTCHA_PROVIDER,
    protectedEndpoints: AUTH_CAPTCHA_PROTECTED_ENDPOINTS,
    secretKey,
    ...(siteVerifyURLOverride === undefined
      ? {}
      : {
          siteVerifyURLOverride,
        }),
  };
}

export function makeAuthenticationConfig(
  environment: AuthenticationEnvironment
): AuthenticationConfig {
  const crossSubDomainCookieDomain =
    resolveExplicitCookieDomain(environment) ??
    resolveCrossSubDomainCookieDomain(environment);
  const mcpResourceUrl =
    environment.mcpResourceUrl ?? makeDefaultMcpResourceUrl(environment);
  const oauthIssuerUrl = normalizeOAuthIssuerUrl(
    environment.oauthIssuerUrl ?? environment.baseUrl
  );
  const oauthClientRegistrationAllowLoopbackRedirects =
    environment.oauthClientRegistrationAllowLoopbackRedirects ??
    isLoopbackHostname(new URL(environment.baseUrl).hostname);
  const versionedSecrets = normalizeAuthenticationVersionedSecrets(
    environment.secrets
  );
  const rateLimitCleanup = makeRateLimitCleanupConfig({
    batchSize: environment.rateLimitCleanupBatchSize,
    enabled: environment.rateLimitCleanupEnabled,
    maxBatches: environment.rateLimitCleanupMaxBatches,
    retentionHours: environment.rateLimitCleanupRetentionHours,
  });

  return {
    appName: "Ceird",
    basePath: DEFAULT_AUTH_BASE_PATH,
    baseURL: environment.baseUrl,
    trustedOrigins: makeAuthenticationTrustedOrigins(environment),
    secret: environment.secret,
    ...(versionedSecrets === undefined
      ? {}
      : {
          secrets: versionedSecrets,
        }),
    databaseUrl: environment.databaseUrl,
    advanced: {
      trustedProxyHeaders: true,
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
      ...(environment.cookiePrefix
        ? {
            cookiePrefix: environment.cookiePrefix,
          }
        : {}),
      ...(crossSubDomainCookieDomain
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: crossSubDomainCookieDomain,
            },
          }
        : {}),
    },
    rateLimit: {
      enabled: environment.rateLimitEnabled ?? true,
      storage: "database",
      customRules: {
        "/sign-in/email": {
          window: 60,
          max: 5,
        },
        "/sign-up/email": {
          window: 60,
          max: 3,
        },
        "/request-password-reset": {
          window: 60,
          max: 3,
        },
        "/send-verification-email": {
          window: 60,
          max: 3,
        },
        "/change-email": {
          window: 60,
          max: 3,
        },
        "/change-password": {
          window: 60,
          max: 5,
        },
        "/two-factor/send-otp": {
          window: 60,
          max: 3,
        },
        "/two-factor/verify-backup-code": {
          window: 60,
          max: 5,
        },
        "/two-factor/verify-otp": {
          window: 60,
          max: 5,
        },
        "/two-factor/verify-totp": {
          window: 60,
          max: 5,
        },
        "/organization/invite-member": {
          window: 3600,
          max: 30,
        },
        "/oauth2/register": {
          window: 60,
          max: 5,
        },
      },
    },
    rateLimitCleanup,
    captcha: makeAuthenticationCaptchaConfig(environment),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: AUTH_PASSWORD_MIN_LENGTH,
      maxPasswordLength: AUTH_PASSWORD_MAX_LENGTH,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendOnSignIn: false,
      sendOnSignUp: true,
    },
    user: {
      additionalFields: {
        twoFactorEnabled: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
      },
      changeEmail: {
        enabled: true,
      },
    },
    passwordCompromiseCheck: {
      enabled: environment.passwordCompromiseCheckEnabled ?? false,
      failOpen: true,
      ...(environment.passwordCompromiseCheckFetchPasswordRange === undefined
        ? {}
        : {
            fetchPasswordRange:
              environment.passwordCompromiseCheckFetchPasswordRange,
          }),
      ...(environment.passwordCompromiseCheckRequestTimeoutMs === undefined
        ? {}
        : {
            requestTimeoutMs:
              environment.passwordCompromiseCheckRequestTimeoutMs,
          }),
    },
    mcpResourceUrl,
    oauthIssuerUrl,
    oauthClientRegistrationAllowLoopbackRedirects,
    oauthConsentPath: DEFAULT_OAUTH_CONSENT_PATH,
    oauthScopes: CEIRD_OAUTH_SCOPES,
    oauthClientRegistrationAllowedScopes:
      CEIRD_OAUTH_CLIENT_REGISTRATION_ALLOWED_SCOPES,
    oauthClientRegistrationDefaultScopes:
      CEIRD_OAUTH_CLIENT_REGISTRATION_DEFAULT_SCOPES,
  };
}

function trimOptionalConfigValue(value: Option.Option<string>) {
  return pipe(
    value,
    Option.map((nextValue) => nextValue.trim()),
    Option.filter((nextValue) => nextValue.length > 0),
    Option.getOrUndefined
  );
}

function parseCommaDelimitedConfigList(value: Option.Option<string>) {
  const rawValue = Option.getOrUndefined(value);

  return rawValue === undefined
    ? undefined
    : rawValue
        .split(",")
        .map((nextValue) => nextValue.trim())
        .filter((nextValue) => nextValue.length > 0);
}

export const loadAuthenticationConfig = Effect.gen(
  function* loadAuthenticationConfig() {
    const baseUrl = yield* authenticationBaseUrlConfig;
    const appOrigin = yield* pipe(
      Config.string("AUTH_APP_ORIGIN"),
      Config.option
    );
    const mcpResourceUrl = yield* authenticationMcpResourceUrlConfig;
    const oauthIssuerUrl = yield* oauthIssuerUrlConfig;
    const cookiePrefix = yield* pipe(
      Config.string("AUTH_COOKIE_PREFIX"),
      Config.option
    );
    const cookieDomain = yield* pipe(
      Config.string("AUTH_COOKIE_DOMAIN"),
      Config.option
    );
    const captchaEnabled = yield* Config.boolean("AUTH_CAPTCHA_ENABLED").pipe(
      Config.withDefault(false)
    );
    const captchaTurnstileSecretKey = yield* Config.option(
      Config.schema(
        AuthenticationCaptchaSecretValue,
        "AUTH_CAPTCHA_TURNSTILE_SECRET_KEY"
      )
    ).pipe(Effect.map(Option.getOrUndefined));
    const captchaSiteVerifyURLOverride = yield* pipe(
      Config.string("AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE").pipe(
        Config.mapOrFail(decodeAuthenticationCaptchaSiteVerifyURLOverrideConfig)
      ),
      Config.option
    );
    const trustedOrigins = yield* pipe(
      Config.string("AUTH_TRUSTED_ORIGINS"),
      Config.option
    );
    const versionedSecrets = yield* Config.option(
      Config.string("BETTER_AUTH_SECRETS").pipe(
        Config.mapOrFail(decodeAuthenticationVersionedSecrets)
      )
    ).pipe(Effect.map(Option.getOrUndefined));
    const secret = yield* Config.schema(
      AuthenticationSecretValue,
      "BETTER_AUTH_SECRET"
    );
    const databaseUrl = yield* authenticationDatabaseUrlConfig;
    const rateLimitEnabled = yield* Config.boolean(
      "AUTH_RATE_LIMIT_ENABLED"
    ).pipe(Config.withDefault(true));
    const rateLimitCleanup = yield* loadRateLimitCleanupConfig;
    const ceirdLocalDev = yield* pipe(
      Config.string("CEIRD_LOCAL_DEV"),
      Config.option
    );
    const passwordCompromiseCheckEnabled = yield* pipe(
      Config.boolean("AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED"),
      Config.option
    );
    const passwordCompromiseCheckRangeURLOverride = yield* pipe(
      Config.string("AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE").pipe(
        Config.mapOrFail(
          decodeAuthenticationPasswordCompromiseCheckRangeURLOverrideConfig
        )
      ),
      Config.option
    );
    const configuredPasswordCompromiseCheckEnabled = Option.getOrUndefined(
      passwordCompromiseCheckEnabled
    );
    const configuredPasswordCompromiseCheckRangeURLOverride =
      trimOptionalConfigValue(passwordCompromiseCheckRangeURLOverride);
    const isLocalDev = Option.getOrUndefined(ceirdLocalDev) === "true";
    const hasLocalAuthenticationBaseUrl = isLoopbackHostname(
      new URL(baseUrl).hostname
    );
    const usesLocalAuthenticationDefaults =
      isLocalDev || hasLocalAuthenticationBaseUrl;

    return makeAuthenticationConfig({
      appOrigin: Option.getOrUndefined(appOrigin),
      baseUrl,
      captchaEnabled,
      captchaSiteVerifyURLOverride: trimOptionalConfigValue(
        captchaSiteVerifyURLOverride
      ),
      captchaTurnstileSecretKey,
      cookieDomain: trimOptionalConfigValue(cookieDomain),
      cookiePrefix: trimOptionalConfigValue(cookiePrefix),
      mcpResourceUrl: Option.getOrUndefined(mcpResourceUrl),
      oauthIssuerUrl: Option.getOrUndefined(oauthIssuerUrl),
      oauthClientRegistrationAllowLoopbackRedirects: isLocalDev
        ? true
        : undefined,
      passwordCompromiseCheckEnabled:
        configuredPasswordCompromiseCheckEnabled ??
        !usesLocalAuthenticationDefaults,
      passwordCompromiseCheckFetchPasswordRange:
        configuredPasswordCompromiseCheckRangeURLOverride === undefined
          ? undefined
          : makePasswordCompromiseCheckRangeURLOverrideFetcher(
              configuredPasswordCompromiseCheckRangeURLOverride
            ),
      secret,
      secrets: versionedSecrets,
      databaseUrl,
      rateLimitEnabled,
      rateLimitCleanupBatchSize: rateLimitCleanup.batchSize,
      rateLimitCleanupEnabled: rateLimitCleanup.enabled,
      rateLimitCleanupMaxBatches: rateLimitCleanup.maxBatches,
      rateLimitCleanupRetentionHours: rateLimitCleanup.retentionHours,
      trustedOrigins: parseCommaDelimitedConfigList(trustedOrigins),
    });
  }
);
