import { HttpApiBuilder, HttpApp } from "@effect/platform";
import { decodeCreateOrganizationInput } from "@task-tracker/identity-core";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { organization } from "better-auth/plugins/organization";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Effect, Layer, Runtime } from "effect";

import { AuthEmailSender } from "./auth-email.js";
import type {
  EmailVerificationEmailInput,
  PasswordResetEmailInput,
} from "./auth-email.js";
import { loadAuthenticationConfig } from "./config.js";
import type { AuthenticationConfig } from "./config.js";
import {
  AuthenticationDatabase,
  AuthenticationDatabaseLive,
} from "./database.js";
import { ResendAuthEmailTransportLive } from "./resend-auth-email-transport.js";
import { authSchema } from "./schema.js";

export function createAuthentication(options: {
  readonly backgroundTaskHandler: (task: Promise<unknown>) => void;
  readonly config: AuthenticationConfig;
  readonly database: NodePgDatabase<typeof authSchema>;
  readonly reportPasswordResetEmailFailure: (error: unknown) => void;
  readonly reportVerificationEmailFailure?: (error: unknown) => void;
  readonly sendPasswordResetEmail: (
    input: PasswordResetEmailInput
  ) => Promise<void>;
  readonly sendVerificationEmail?: (
    input: EmailVerificationEmailInput
  ) => Promise<void>;
}) {
  const { config, database, sendPasswordResetEmail, sendVerificationEmail } =
    options;
  const reportVerificationEmailFailure =
    options.reportVerificationEmailFailure ?? (() => {});
  const sendVerificationEmailHandler =
    sendVerificationEmail ?? (() => Promise.resolve());
  const { databaseUrl: _databaseUrl, ...authConfig } = config;

  return betterAuth({
    ...authConfig,
    advanced: {
      backgroundTasks: {
        handler: options.backgroundTaskHandler,
      },
    },
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: authSchema,
    }),
    plugins: [
      organization({
        organizationHooks: {
          beforeCreateOrganization: ({ organization: nextOrganization }) => {
            let input;

            try {
              input = decodeCreateOrganizationInput(nextOrganization);
            } catch {
              throw APIError.from("BAD_REQUEST", {
                code: "INVALID_ORGANIZATION_INPUT",
                message:
                  "Organization name must be at least 2 characters long and the slug must use lowercase letters, numbers, and hyphens only.",
              });
            }

            return Promise.resolve({
              data: {
                ...nextOrganization,
                name: input.name,
                slug: input.slug,
              },
            });
          },
        },
      }),
    ],
    emailAndPassword: {
      ...authConfig.emailAndPassword,
      sendResetPassword: async ({ token, user, url }) => {
        try {
          await sendPasswordResetEmail({
            idempotencyKey: `password-reset/${user.id}/${token}`,
            recipientEmail: user.email,
            recipientName: user.name ?? user.email,
            resetUrl: url,
          } as const satisfies PasswordResetEmailInput);
        } catch (error) {
          options.reportPasswordResetEmailFailure(error);
          throw error;
        }
      },
    },
    emailVerification: {
      ...authConfig.emailVerification,
      sendVerificationEmail: async ({ user, token, url }) => {
        try {
          await sendVerificationEmailHandler({
            idempotencyKey: `email-verification/${user.id}/${token}`,
            recipientEmail: user.email,
            recipientName: user.name ?? user.email,
            verificationUrl: url,
          } as const satisfies EmailVerificationEmailInput);
        } catch (error) {
          reportVerificationEmailFailure(error);
          throw error;
        }
      },
    },
  });
}

function makeAuthenticationBackgroundTaskHandler() {
  return (task: Promise<unknown>) => {
    // Follow-up tracked in TSK-37: replace this temporary in-process
    // queueMicrotask scheduler with a durable background queue so auth email
    // delivery survives process restarts and can be retried independently of
    // the request lifecycle.
    queueMicrotask(() => {
      void task;
    });
  };
}

function makePasswordResetEmailFailureReporter(
  runtime: Runtime.Runtime<never>
) {
  const runFork = Runtime.runFork(runtime);

  return (error: unknown) => {
    runFork(
      Effect.logError("Password reset email delivery failed", {
        error: serializeBackgroundTaskError(error),
      })
    );
  };
}

function makeVerificationEmailFailureReporter(runtime: Runtime.Runtime<never>) {
  const runFork = Runtime.runFork(runtime);

  return (error: unknown) => {
    runFork(
      Effect.logError("Verification email delivery failed", {
        error: serializeBackgroundTaskError(error),
      })
    );
  };
}

function serializeBackgroundTaskError(error: unknown) {
  if (typeof error === "object" && error !== null) {
    return {
      cause:
        "cause" in error && typeof error.cause === "string"
          ? error.cause
          : undefined,
      message:
        "message" in error && typeof error.message === "string"
          ? error.message
          : String(error),
      tag: "_tag" in error && typeof error._tag === "string" ? error._tag : "",
    };
  }

  return {
    message: String(error),
  };
}

function matchesTrustedOrigin(
  origin: string,
  trustedOrigins: readonly string[]
) {
  return trustedOrigins.some((pattern) => {
    if (!pattern.includes("*") && !pattern.includes("?")) {
      return pattern === origin;
    }

    const escapedPattern = pattern.replaceAll(/[.+^${}()|[\]\\]/g, "\\$&");
    const matcher = escapedPattern
      .replaceAll("\\*", ".*")
      .replaceAll("\\?", ".");

    return new RegExp(`^${matcher}$`).test(origin);
  });
}

function appendVaryHeader(headers: Headers, value: string) {
  const current = headers.get("Vary");

  if (!current) {
    headers.set("Vary", value);
    return;
  }

  const values = new Set([
    ...current
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
    value,
  ]);
  headers.set("Vary", [...values].join(", "));
}

function withAuthenticationCors(
  handler: (request: Request) => Promise<Response>,
  trustedOrigins: readonly string[]
) {
  return async (request: Request) => {
    const origin = request.headers.get("origin");
    const isTrustedOrigin =
      typeof origin === "string" &&
      matchesTrustedOrigin(origin, trustedOrigins);

    if (request.method === "OPTIONS") {
      if (!isTrustedOrigin) {
        return new Response(null, { status: 403 });
      }

      const response = new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Headers":
            request.headers.get("access-control-request-headers") ??
            "content-type",
          "Access-Control-Allow-Methods":
            request.headers.get("access-control-request-method") ??
            "GET, POST, OPTIONS",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Max-Age": "600",
        },
      });

      appendVaryHeader(response.headers, "Origin");
      appendVaryHeader(response.headers, "Access-Control-Request-Headers");

      return response;
    }

    const response = await handler(request);

    if (!isTrustedOrigin) {
      return response;
    }

    const corsResponse = new Response(response.body, response);
    corsResponse.headers.set("Access-Control-Allow-Credentials", "true");
    corsResponse.headers.set("Access-Control-Allow-Origin", origin);
    appendVaryHeader(corsResponse.headers, "Origin");

    return corsResponse;
  };
}

const AuthenticationEmailSenderLive = AuthEmailSender.Default.pipe(
  Layer.provide(ResendAuthEmailTransportLive)
);

export class Authentication extends Effect.Service<Authentication>()(
  "@task-tracker/domains/identity/authentication/Authentication",
  {
    dependencies: [AuthenticationDatabaseLive, AuthenticationEmailSenderLive],
    effect: Effect.gen(function* AuthenticationLive() {
      const config = yield* loadAuthenticationConfig;
      const { db } = yield* AuthenticationDatabase;
      const authEmailSender = yield* AuthEmailSender;
      const runtime = yield* Effect.runtime<never>();
      const runPromise = Runtime.runPromise(runtime);
      const backgroundTaskHandler = makeAuthenticationBackgroundTaskHandler();
      const reportPasswordResetEmailFailure =
        makePasswordResetEmailFailureReporter(runtime);
      const reportVerificationEmailFailure =
        makeVerificationEmailFailureReporter(runtime);

      return createAuthentication({
        backgroundTaskHandler,
        config,
        database: db,
        reportPasswordResetEmailFailure,
        reportVerificationEmailFailure,
        sendPasswordResetEmail: (input) =>
          runPromise(authEmailSender.sendPasswordResetEmail(input)),
        sendVerificationEmail: (input) =>
          runPromise(authEmailSender.sendEmailVerificationEmail(input)),
      });
    }),
  }
) {}

export const AuthenticationHttpLive = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* mountAuthenticationHttp() {
    const auth = yield* Authentication;
    const config = yield* loadAuthenticationConfig;

    // Effect strips mount prefixes by default. Better Auth expects to receive
    // its configured basePath, so we preserve the full /api/auth prefix here.
    yield* router.mountApp(
      "/api/auth",
      HttpApp.fromWebHandler(
        withAuthenticationCors(auth.handler, config.trustedOrigins)
      ),
      {
        includePrefix: true,
      }
    );
  })
).pipe(Layer.provide(Authentication.Default));
