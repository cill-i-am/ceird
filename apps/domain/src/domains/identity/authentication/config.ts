import { Config, Effect, Option, Schema, pipe } from "effect";

import {
  DEFAULT_APP_DATABASE_URL,
  appDatabaseUrlConfig,
} from "../../../platform/database/config.js";

export const DEFAULT_AUTH_BASE_PATH = "/api/auth" as const;
export const DEFAULT_AUTH_DATABASE_URL = DEFAULT_APP_DATABASE_URL;
export const DEFAULT_MCP_RESOURCE_PATH = "/mcp" as const;
export const DEFAULT_OAUTH_CONSENT_PATH = "/oauth/consent" as const;
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
const TrustedOriginPattern = Schema.String.pipe(
  Schema.pattern(/^https?:\/\/(?:\*\.)?[a-z0-9.-]+(?::\d+)?$/i),
  Schema.brand("TrustedOriginPattern")
);

export type TrustedOriginPattern = Schema.Schema.Type<
  typeof TrustedOriginPattern
>;

const decodeTrustedOriginPattern =
  Schema.decodeUnknownSync(TrustedOriginPattern);

function makeTrustedOriginPattern(value: string): TrustedOriginPattern {
  return decodeTrustedOriginPattern(value);
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
    const matcher = escapedPattern.replaceAll("*", ".*").replaceAll("?", ".");

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
const authenticationBaseUrlConfig = Config.string("BETTER_AUTH_BASE_URL").pipe(
  Config.validate({
    message: "BETTER_AUTH_BASE_URL must be a valid absolute URL",
    validation: (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
  })
);
const absoluteUrlConfig = (name: string) =>
  Config.string(name).pipe(
    Config.validate({
      message: `${name} must be a valid absolute URL`,
      validation: (value) => {
        try {
          const url = new URL(value);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      },
    })
  );

const authenticationMcpResourceUrlConfig = absoluteUrlConfig(
  "MCP_RESOURCE_URL"
).pipe(Config.option);
const oauthIssuerUrlConfig = absoluteUrlConfig("OAUTH_ISSUER_URL").pipe(
  Config.option
);

function isLoopbackHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.startsWith("127.")
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
  readonly mcpResourceUrl?: string | undefined;
  readonly oauthIssuerUrl?: string | undefined;
  readonly secret: string;
  readonly databaseUrl: string;
  readonly rateLimitEnabled?: boolean | undefined;
}

export interface AuthenticationConfig {
  readonly appName: "Ceird";
  readonly basePath: typeof DEFAULT_AUTH_BASE_PATH;
  readonly baseURL: string;
  readonly trustedOrigins: TrustedOriginPattern[];
  readonly secret: string;
  readonly databaseUrl: string;
  readonly advanced?: {
    readonly trustedProxyHeaders: true;
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
    };
  };
  readonly emailAndPassword: {
    readonly enabled: true;
    readonly revokeSessionsOnPasswordReset: true;
  };
  readonly emailVerification: {
    readonly autoSignInAfterVerification: false;
    readonly expiresIn: 3600;
    readonly sendOnSignIn: false;
    readonly sendOnSignUp: true;
  };
  readonly user: {
    readonly changeEmail: {
      readonly enabled: true;
    };
  };
  readonly mcpResourceUrl: string;
  readonly oauthIssuerUrl: string;
  readonly oauthConsentPath: typeof DEFAULT_OAUTH_CONSENT_PATH;
  readonly oauthScopes: typeof CEIRD_OAUTH_SCOPES;
  readonly oauthClientRegistrationDefaultScopes: typeof CEIRD_OAUTH_CLIENT_REGISTRATION_DEFAULT_SCOPES;
}

export class AuthenticationConfigService extends Effect.Service<AuthenticationConfigService>()(
  "@ceird/domains/identity/authentication/AuthenticationConfigService",
  {
    effect: Effect.gen(function* AuthenticationConfigServiceEffect() {
      return yield* loadAuthenticationConfig;
    }),
  }
) {}

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
    return undefined;
  }

  return findSharedDomain(base.hostname, app.hostname);
}

export function makeAuthenticationTrustedOrigins(
  environment: Pick<AuthenticationEnvironment, "appOrigin">
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

  return [...trustedOrigins];
}

function makeDefaultMcpResourceUrl(
  environment: Pick<AuthenticationEnvironment, "baseUrl">
) {
  const url = new URL(environment.baseUrl);
  return new URL(DEFAULT_MCP_RESOURCE_PATH, url.origin).toString();
}

export function makeAuthenticationConfig(
  environment: AuthenticationEnvironment
): AuthenticationConfig {
  const crossSubDomainCookieDomain =
    resolveCrossSubDomainCookieDomain(environment);
  const mcpResourceUrl =
    environment.mcpResourceUrl ?? makeDefaultMcpResourceUrl(environment);
  const oauthIssuerUrl = normalizeOAuthIssuerUrl(
    environment.oauthIssuerUrl ?? environment.baseUrl
  );

  return {
    appName: "Ceird",
    basePath: DEFAULT_AUTH_BASE_PATH,
    baseURL: environment.baseUrl,
    trustedOrigins: makeAuthenticationTrustedOrigins(environment),
    secret: environment.secret,
    databaseUrl: environment.databaseUrl,
    advanced: {
      trustedProxyHeaders: true,
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
      },
    },
    emailAndPassword: {
      enabled: true,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendOnSignIn: false,
      sendOnSignUp: true,
    },
    user: {
      changeEmail: {
        enabled: true,
      },
    },
    mcpResourceUrl,
    oauthIssuerUrl,
    oauthConsentPath: DEFAULT_OAUTH_CONSENT_PATH,
    oauthScopes: CEIRD_OAUTH_SCOPES,
    oauthClientRegistrationDefaultScopes:
      CEIRD_OAUTH_CLIENT_REGISTRATION_DEFAULT_SCOPES,
  };
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
    const secret = yield* Config.string("BETTER_AUTH_SECRET").pipe(
      Config.validate({
        message: "BETTER_AUTH_SECRET must be at least 32 characters long",
        validation: (value) => value.length >= 32,
      })
    );
    const databaseUrl = yield* authenticationDatabaseUrlConfig;
    const rateLimitEnabled = yield* Config.boolean(
      "AUTH_RATE_LIMIT_ENABLED"
    ).pipe(Config.withDefault(true));

    return makeAuthenticationConfig({
      appOrigin: Option.getOrUndefined(appOrigin),
      baseUrl,
      mcpResourceUrl: Option.getOrUndefined(mcpResourceUrl),
      oauthIssuerUrl: Option.getOrUndefined(oauthIssuerUrl),
      secret,
      databaseUrl,
      rateLimitEnabled,
    });
  }
);
