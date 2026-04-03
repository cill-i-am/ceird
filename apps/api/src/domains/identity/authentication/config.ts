import { Config, Effect, Option, Schema, pipe } from "effect";

export const DEFAULT_AUTH_BASE_PATH = "/api/auth" as const;
export const DEFAULT_AUTH_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5439/task_tracker";
export const DEFAULT_SANDBOX_ALLOWED_HOST_PATTERN = "*.localhost:1355";
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

export const DEFAULT_SANDBOX_APP_ORIGIN_HTTP_PATTERN = makeTrustedOriginPattern(
  "http://*.app.task-tracker.localhost:1355"
);
export const DEFAULT_SANDBOX_APP_ORIGIN_HTTPS_PATTERN =
  makeTrustedOriginPattern("https://*.app.task-tracker.localhost:1355");

const DEFAULT_LOCAL_APP_ORIGIN_STRINGS = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
] as const;

const DEFAULT_LOCAL_APP_ORIGINS = DEFAULT_LOCAL_APP_ORIGIN_STRINGS.map(
  makeTrustedOriginPattern
);
export const authenticationDatabaseUrlConfig = Config.string(
  "DATABASE_URL"
).pipe(Config.withDefault(DEFAULT_AUTH_DATABASE_URL));

export interface AuthenticationEnvironment {
  readonly host: string;
  readonly port: number;
  readonly explicitBaseUrl?: string | undefined;
  readonly portlessUrl?: string | undefined;
  readonly secret: string;
  readonly databaseUrl: string;
}

export interface DynamicAuthenticationBaseUrl {
  readonly allowedHosts: [string, ...string[]];
  readonly fallback: string;
}

export interface AuthenticationConfig {
  readonly appName: "Task Tracker";
  readonly basePath: typeof DEFAULT_AUTH_BASE_PATH;
  readonly baseURL: string | DynamicAuthenticationBaseUrl;
  readonly trustedOrigins: TrustedOriginPattern[];
  readonly secret: string;
  readonly databaseUrl: string;
  readonly rateLimit: {
    readonly enabled: true;
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
    };
  };
  readonly emailAndPassword: {
    readonly enabled: true;
  };
}

export function makeAuthenticationTrustedOrigins(
  environment: Pick<AuthenticationEnvironment, "portlessUrl">
): TrustedOriginPattern[] {
  const trustedOrigins = new Set<TrustedOriginPattern>([
    ...DEFAULT_LOCAL_APP_ORIGINS,
    DEFAULT_SANDBOX_APP_ORIGIN_HTTP_PATTERN,
    DEFAULT_SANDBOX_APP_ORIGIN_HTTPS_PATTERN,
  ]);

  if (environment.portlessUrl) {
    try {
      const appUrl = new URL(environment.portlessUrl);
      appUrl.hostname = appUrl.hostname.replace(
        ".api.task-tracker.localhost",
        ".app.task-tracker.localhost"
      );
      trustedOrigins.add(makeTrustedOriginPattern(appUrl.origin));
    } catch {
      // Ignore malformed PORTLESS_URL values and keep the default trusted origins.
    }
  }

  return [...trustedOrigins];
}

export function makeDynamicAuthenticationBaseUrl(
  environment: Pick<AuthenticationEnvironment, "host" | "port" | "portlessUrl">
): DynamicAuthenticationBaseUrl {
  const normalizedHost =
    environment.host === "0.0.0.0" ? "127.0.0.1" : environment.host;
  const fallback = `http://${normalizedHost}:${environment.port}`;
  const allowedHosts = new Set<string>([
    `127.0.0.1:${environment.port}`,
    `localhost:${environment.port}`,
    DEFAULT_SANDBOX_ALLOWED_HOST_PATTERN,
  ]);

  if (environment.portlessUrl) {
    try {
      allowedHosts.add(new URL(environment.portlessUrl).host);
    } catch {
      // Ignore malformed PORTLESS_URL values and fall back to local defaults.
    }
  }

  return {
    allowedHosts: [...allowedHosts] as [string, ...string[]],
    fallback,
  };
}

export function makeAuthenticationConfig(
  environment: AuthenticationEnvironment
): AuthenticationConfig {
  return {
    appName: "Task Tracker",
    basePath: DEFAULT_AUTH_BASE_PATH,
    baseURL:
      environment.explicitBaseUrl ??
      makeDynamicAuthenticationBaseUrl(environment),
    trustedOrigins: makeAuthenticationTrustedOrigins(environment),
    secret: environment.secret,
    databaseUrl: environment.databaseUrl,
    rateLimit: {
      enabled: true,
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
      },
    },
    emailAndPassword: {
      enabled: true,
    },
  };
}

export const loadAuthenticationConfig = Effect.gen(
  function* loadAuthenticationConfig() {
    const host = yield* Config.string("HOST").pipe(
      Config.withDefault("127.0.0.1")
    );
    const port = yield* Config.port("PORT").pipe(Config.withDefault(3000));
    const explicitBaseUrl = yield* pipe(
      Config.string("BETTER_AUTH_BASE_URL"),
      Config.option
    );
    const portlessUrl = yield* pipe(
      Config.string("PORTLESS_URL"),
      Config.option
    );
    const secret = yield* Config.string("BETTER_AUTH_SECRET").pipe(
      Config.validate({
        message: "BETTER_AUTH_SECRET must be at least 32 characters long",
        validation: (value) => value.length >= 32,
      })
    );
    const databaseUrl = yield* authenticationDatabaseUrlConfig;

    return makeAuthenticationConfig({
      host,
      port,
      explicitBaseUrl: Option.getOrUndefined(explicitBaseUrl),
      portlessUrl: Option.getOrUndefined(portlessUrl),
      secret,
      databaseUrl,
    });
  }
);
