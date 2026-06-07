import type { BetterAuthPlugin } from "better-auth";
import { defineErrorCodes } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { Context, Duration, Effect } from "effect";

import {
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
} from "./config.js";

export const PASSWORD_COMPROMISED_ERROR_CODE = "PASSWORD_COMPROMISED" as const;
export const PASSWORD_COMPROMISED_MESSAGE =
  "The password you entered has been compromised. Please choose a different password.";
export const DEFAULT_PASSWORD_COMPROMISE_CHECK_PATHS = [
  "/sign-up/email",
  "/change-password",
  "/reset-password",
] as const;
export const DEFAULT_PASSWORD_COMPROMISE_CHECK_TIMEOUT_MS = 3000 as const;

const PASSWORD_COMPROMISE_ERROR_CODES = defineErrorCodes({
  [PASSWORD_COMPROMISED_ERROR_CODE]: PASSWORD_COMPROMISED_MESSAGE,
});

type PasswordCompromiseCheckPath =
  (typeof DEFAULT_PASSWORD_COMPROMISE_CHECK_PATHS)[number];
export type FetchPasswordRange = (
  prefix: string,
  options?: { readonly signal?: AbortSignal | undefined } | undefined
) => Promise<string>;
type PasswordCompromiseCheckFailureReporter = (error: unknown) => void;
type AuthEffectRuntimeContext = Context.Context<never>;

export interface PasswordCompromiseCheckPluginOptions {
  readonly enabled: boolean;
  readonly failOpen: true;
  readonly fetchPasswordRange?: FetchPasswordRange | undefined;
  readonly paths?: readonly PasswordCompromiseCheckPath[] | undefined;
  readonly reportProviderFailure?:
    | PasswordCompromiseCheckFailureReporter
    | undefined;
  readonly requestTimeoutMs?: number | undefined;
}

export function makePasswordCompromiseCheckPlugin(
  options: PasswordCompromiseCheckPluginOptions
) {
  const paths = options.paths ?? DEFAULT_PASSWORD_COMPROMISE_CHECK_PATHS;

  return {
    id: "ceird-have-i-been-pwned",
    hooks: {
      before: [
        {
          matcher: (context) =>
            options.enabled === true &&
            typeof context.path === "string" &&
            paths.includes(context.path as PasswordCompromiseCheckPath),
          handler: createAuthMiddleware(async (context) => {
            const password = readPasswordFromBody(context.path, context.body);

            if (password === undefined) {
              return;
            }

            await assertPasswordNotCompromised({
              password,
              fetchPasswordRange: options.fetchPasswordRange,
              reportProviderFailure: options.reportProviderFailure,
              requestTimeoutMs: options.requestTimeoutMs,
            });
          }),
        },
      ],
    },
    options: {
      enabled: options.enabled,
      failOpen: options.failOpen,
      paths: [...paths],
    },
    $ERROR_CODES: PASSWORD_COMPROMISE_ERROR_CODES,
  } satisfies BetterAuthPlugin;
}

export async function assertPasswordNotCompromised(options: {
  readonly password: string;
  readonly fetchPasswordRange?: FetchPasswordRange | undefined;
  readonly reportProviderFailure?:
    | PasswordCompromiseCheckFailureReporter
    | undefined;
  readonly requestTimeoutMs?: number | undefined;
}) {
  if (!isPasswordInCompromiseCheckPolicyRange(options.password)) {
    return;
  }

  const { prefix, suffix } = await hashPasswordForPwnedPasswordRange(
    options.password
  );
  const fetchPasswordRange =
    options.fetchPasswordRange ?? fetchPwnedPasswordRange;
  const requestTimeoutMs =
    options.requestTimeoutMs ?? DEFAULT_PASSWORD_COMPROMISE_CHECK_TIMEOUT_MS;
  let rangeBody: string;

  try {
    rangeBody = await fetchPasswordRangeWithTimeout({
      fetchPasswordRange,
      prefix,
      requestTimeoutMs,
    });
  } catch (error) {
    options.reportProviderFailure?.(error);
    return;
  }

  if (pwnedPasswordRangeIncludesSuffix(rangeBody, suffix)) {
    throw APIError.from("BAD_REQUEST", {
      code: PASSWORD_COMPROMISED_ERROR_CODE,
      message: PASSWORD_COMPROMISED_MESSAGE,
    });
  }
}

export async function hashPasswordForPwnedPasswordRange(password: string) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return {
    prefix: hash.slice(0, 5),
    suffix: hash.slice(5),
  };
}

function isPasswordInCompromiseCheckPolicyRange(password: string) {
  return (
    password.length >= AUTH_PASSWORD_MIN_LENGTH &&
    password.length <= AUTH_PASSWORD_MAX_LENGTH
  );
}

export function makePasswordCompromiseCheckFailureReporter(
  runtimeContext: AuthEffectRuntimeContext = Context.empty(),
  scheduleReport?: ((task: Promise<unknown>) => void) | undefined
) {
  return (error: unknown) => {
    const report = Effect.runPromiseWith(runtimeContext)(
      Effect.logError(
        "Password compromise provider unavailable; failing open"
      ).pipe(
        Effect.annotateLogs({
          authAbuseAlertPolicy: "alert_on_repeated_provider_failure",
          authAbuseSignal: "password_compromise_provider_failure",
          authAbuseSignalSeverity: "high",
          authPasswordCompromiseCheckFailure: "provider_unavailable",
          authPasswordCompromiseCheckSeverity: "high",
          authPasswordCompromiseCheckCause:
            serializePasswordCompromiseProviderError(error),
        })
      )
    );

    if (scheduleReport) {
      scheduleReport(report);
      return;
    }

    void ignorePasswordCompromiseReportFailure(report);
  };
}

async function ignorePasswordCompromiseReportFailure(report: Promise<unknown>) {
  try {
    await report;
  } catch {
    // The fallback reporter must never replace the original provider outcome.
  }
}

function fetchPasswordRangeWithTimeout(options: {
  readonly fetchPasswordRange: FetchPasswordRange;
  readonly prefix: string;
  readonly requestTimeoutMs: number;
}) {
  const controller = new AbortController();
  const timeoutError = new Error(
    `HIBP range request timed out after ${options.requestTimeoutMs}ms`
  );

  return Effect.runPromise(
    Effect.tryPromise({
      try: () =>
        options.fetchPasswordRange(options.prefix, {
          signal: controller.signal,
        }),
      catch: (cause) => cause,
    }).pipe(
      Effect.timeoutOrElse({
        duration: Duration.millis(options.requestTimeoutMs),
        orElse: () => Effect.fail(timeoutError),
      }),
      Effect.ensuring(Effect.sync(() => controller.abort(timeoutError)))
    )
  );
}

async function fetchPwnedPasswordRange(
  prefix: string,
  options?: { readonly signal?: AbortSignal | undefined } | undefined
) {
  const response = await fetch(
    `https://api.pwnedpasswords.com/range/${prefix}`,
    {
      headers: {
        "Add-Padding": "true",
        "User-Agent": "Ceird Password Checker",
      },
      signal: options?.signal,
    }
  );

  if (!response.ok) {
    throw new Error(`HIBP range request failed with status ${response.status}`);
  }

  return response.text();
}

function pwnedPasswordRangeIncludesSuffix(rangeBody: string, suffix: string) {
  const normalizedSuffix = suffix.toUpperCase();

  return rangeBody.split("\n").some((line) => {
    const [candidate] = line.split(":", 1);

    return candidate?.trim().toUpperCase() === normalizedSuffix;
  });
}

function readPasswordFromBody(path: string | undefined, body: unknown) {
  if (!isRecord(body)) {
    return;
  }

  if (path === "/change-password" || path === "/reset-password") {
    return typeof body.newPassword === "string" ? body.newPassword : undefined;
  }

  return typeof body.password === "string" ? body.password : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function serializePasswordCompromiseProviderError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
