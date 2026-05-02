import { Config, Effect, Option, Schema, pipe } from "effect";

import {
  DEFAULT_APP_DATABASE_URL,
  appDatabaseUrlConfig,
} from "../../../platform/database/config.js";

export const DEFAULT_AUTH_BASE_PATH = "/api/auth" as const;
export const DEFAULT_AUTH_DATABASE_URL = DEFAULT_APP_DATABASE_URL;
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

export const DEFAULT_SANDBOX_APP_ORIGIN_HTTP_PATTERN = makeTrustedOriginPattern(
  "http://*.app.task-tracker.localhost:1355"
);
export const DEFAULT_SANDBOX_APP_ORIGIN_HTTPS_PATTERN =
  makeTrustedOriginPattern("https://*.app.task-tracker.localhost:1355");
export const DEFAULT_PORTLESS_APP_ORIGIN_HTTP = makeTrustedOriginPattern(
  "http://app.task-tracker.localhost:1355"
);
export const DEFAULT_PORTLESS_APP_ORIGIN_HTTPS = makeTrustedOriginPattern(
  "https://app.task-tracker.localhost:1355"
);

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

export interface AuthenticationEnvironment {
  readonly appOrigin?: string | undefined;
  readonly baseUrl: string;
  readonly portlessUrl?: string | undefined;
  readonly secret: string;
  readonly databaseUrl: string;
  readonly rateLimitEnabled?: boolean | undefined;
}

export interface AuthenticationConfig {
  readonly appName: "Task Tracker";
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
}

export class AuthenticationConfigService extends Effect.Service<AuthenticationConfigService>()(
  "@task-tracker/domains/identity/authentication/AuthenticationConfigService",
  {
    effect: Effect.gen(function* AuthenticationConfigServiceEffect() {
      return yield* loadAuthenticationConfig;
    }),
  }
) {}

const TASK_TRACKER_LOCALHOST_SUFFIX = ".task-tracker.localhost";
const TASK_TRACKER_LOCALHOST_COOKIE_DOMAIN = "task-tracker.localhost";

function readHostname(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

export function resolveCrossSubDomainCookieDomain(
  environment: Pick<
    AuthenticationEnvironment,
    "appOrigin" | "baseUrl" | "portlessUrl"
  >
): string | undefined {
  const hostnames = [
    readHostname(environment.baseUrl),
    readHostname(environment.portlessUrl),
    readHostname(environment.appOrigin),
  ];

  return hostnames.some(
    (hostname) =>
      hostname === TASK_TRACKER_LOCALHOST_COOKIE_DOMAIN ||
      hostname?.endsWith(TASK_TRACKER_LOCALHOST_SUFFIX) === true
  )
    ? TASK_TRACKER_LOCALHOST_COOKIE_DOMAIN
    : undefined;
}

export function makeAuthenticationTrustedOrigins(
  environment: Pick<AuthenticationEnvironment, "appOrigin" | "portlessUrl">
): TrustedOriginPattern[] {
  const trustedOrigins = new Set<TrustedOriginPattern>([
    ...DEFAULT_LOCAL_APP_ORIGINS,
    DEFAULT_SANDBOX_APP_ORIGIN_HTTP_PATTERN,
    DEFAULT_SANDBOX_APP_ORIGIN_HTTPS_PATTERN,
    DEFAULT_PORTLESS_APP_ORIGIN_HTTP,
    DEFAULT_PORTLESS_APP_ORIGIN_HTTPS,
  ]);

  if (environment.portlessUrl) {
    try {
      const appUrl = new URL(environment.portlessUrl);
      if (appUrl.hostname.includes(".api.task-tracker.localhost")) {
        appUrl.hostname = appUrl.hostname.replace(
          ".api.task-tracker.localhost",
          ".app.task-tracker.localhost"
        );
      } else if (appUrl.hostname === "api.task-tracker.localhost") {
        appUrl.hostname = "app.task-tracker.localhost";
      }
      trustedOrigins.add(makeTrustedOriginPattern(appUrl.origin));
    } catch {
      // Ignore malformed PORTLESS_URL values and keep the default trusted origins.
    }
  }

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

export function makeAuthenticationConfig(
  environment: AuthenticationEnvironment
): AuthenticationConfig {
  const crossSubDomainCookieDomain =
    resolveCrossSubDomainCookieDomain(environment);

  return {
    appName: "Task Tracker",
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
  };
}

export const loadAuthenticationConfig = Effect.gen(
  function* loadAuthenticationConfig() {
    const baseUrl = yield* authenticationBaseUrlConfig;
    const portlessUrl = yield* pipe(
      Config.string("PORTLESS_URL"),
      Config.option
    );
    const appOrigin = yield* pipe(
      Config.string("AUTH_APP_ORIGIN"),
      Config.option
    );
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
      portlessUrl: Option.getOrUndefined(portlessUrl),
      secret,
      databaseUrl,
      rateLimitEnabled,
    });
  }
);
