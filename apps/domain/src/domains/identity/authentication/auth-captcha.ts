import type { BetterAuthPlugin } from "better-auth";
import { defineErrorCodes } from "better-auth";
import { getIp } from "better-auth/api";
import { Context, Duration, Effect, Result, Schema } from "effect";

export const DEFAULT_AUTH_CAPTCHA_SITE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify" as const;
export const DEFAULT_AUTH_CAPTCHA_SITE_VERIFY_REQUEST_TIMEOUT_MS =
  3000 as const;
export const AUTH_CAPTCHA_MISSING_RESPONSE_ERROR_CODE =
  "MISSING_RESPONSE" as const;
export const AUTH_CAPTCHA_MISSING_RESPONSE_MESSAGE =
  "Missing CAPTCHA response" as const;
export const AUTH_CAPTCHA_VERIFICATION_FAILED_ERROR_CODE =
  "VERIFICATION_FAILED" as const;
export const AUTH_CAPTCHA_VERIFICATION_FAILED_MESSAGE =
  "Captcha verification failed" as const;

const AUTH_CAPTCHA_ERROR_CODES = defineErrorCodes({
  [AUTH_CAPTCHA_MISSING_RESPONSE_ERROR_CODE]:
    AUTH_CAPTCHA_MISSING_RESPONSE_MESSAGE,
  [AUTH_CAPTCHA_VERIFICATION_FAILED_ERROR_CODE]:
    AUTH_CAPTCHA_VERIFICATION_FAILED_MESSAGE,
});
const CloudflareTurnstileSiteVerifyResponse = Schema.Struct({
  "error-codes": Schema.optional(Schema.Array(Schema.String)),
  success: Schema.Boolean,
});
const decodeCloudflareTurnstileSiteVerifyResponse = Schema.decodeUnknownEffect(
  CloudflareTurnstileSiteVerifyResponse
);
const TURNSTILE_USER_REJECTION_ERROR_CODES: ReadonlySet<string> = new Set([
  "invalid-input-response",
  "timeout-or-duplicate",
] as const);
const TURNSTILE_KNOWN_ERROR_CODES: ReadonlySet<string> = new Set([
  "bad-request",
  "internal-error",
  "invalid-input-response",
  "invalid-input-secret",
  "missing-input-response",
  "missing-input-secret",
  "timeout-or-duplicate",
] as const);

type AuthEffectRuntimeContext = Context.Context<never>;
type AuthCaptchaFailureMode = "fail_closed";
type AuthCaptchaProviderFailure =
  | "invalid_response"
  | "provider_error"
  | "request_failed"
  | "request_timed_out";
type AuthCaptchaVerificationResult =
  | {
      readonly status: "verified";
    }
  | {
      readonly errorCodes: readonly string[];
      readonly status: "rejected";
    }
  | {
      readonly cause: unknown;
      readonly failure: AuthCaptchaProviderFailure;
      readonly providerErrorCodes?: readonly string[] | undefined;
      readonly responseStatus?: number | undefined;
      readonly status: "provider_failed";
    };
type AuthCaptchaProviderFailureResult = Extract<
  AuthCaptchaVerificationResult,
  { readonly status: "provider_failed" }
>;

export interface AuthCaptchaProviderFailureEvent {
  readonly cause: unknown;
  readonly endpointPath: string;
  readonly failure: AuthCaptchaProviderFailure;
  readonly failureMode: AuthCaptchaFailureMode;
  readonly provider: "cloudflare-turnstile";
  readonly providerErrorCodes?: readonly string[] | undefined;
  readonly requestTimeoutMs: number;
  readonly responseStatus?: number | undefined;
}

export type AuthCaptchaProviderFailureReporter = (
  event: AuthCaptchaProviderFailureEvent
) => void;

export interface AuthCaptchaPluginOptions {
  readonly endpoints: readonly string[];
  readonly provider: "cloudflare-turnstile";
  readonly reportProviderFailure?:
    | AuthCaptchaProviderFailureReporter
    | undefined;
  readonly secretKey: string;
  readonly siteVerifyRequestTimeoutMs?: number | undefined;
  readonly siteVerifyURLOverride?: string | undefined;
}

export function makeAuthCaptchaPlugin(options: AuthCaptchaPluginOptions) {
  const siteVerifyRequestTimeoutMs =
    options.siteVerifyRequestTimeoutMs ??
    DEFAULT_AUTH_CAPTCHA_SITE_VERIFY_REQUEST_TIMEOUT_MS;
  const siteVerifyURL =
    options.siteVerifyURLOverride ?? DEFAULT_AUTH_CAPTCHA_SITE_VERIFY_URL;
  const endpoints = [...options.endpoints];

  return {
    id: "captcha",
    $ERROR_CODES: AUTH_CAPTCHA_ERROR_CODES,
    onRequest: async (request, context) => {
      if (request.method.toUpperCase() !== "POST") {
        return;
      }

      const endpointPath = resolveAuthCaptchaEndpointPath(request, endpoints);

      if (endpointPath === undefined) {
        return;
      }

      const captchaResponse = request.headers.get("x-captcha-response")?.trim();

      if (!captchaResponse) {
        return makeAuthCaptchaErrorResponse({
          code: AUTH_CAPTCHA_MISSING_RESPONSE_ERROR_CODE,
          message: AUTH_CAPTCHA_MISSING_RESPONSE_MESSAGE,
          status: 400,
        });
      }

      const result = await verifyCloudflareTurnstileWithTimeout({
        captchaResponse,
        remoteIP: getIp(request, context.options) ?? undefined,
        requestTimeoutMs: siteVerifyRequestTimeoutMs,
        secretKey: options.secretKey,
        siteVerifyURL,
      });

      if (result.status === "verified") {
        return;
      }

      if (result.status === "provider_failed") {
        reportAuthCaptchaProviderFailure({
          endpointPath,
          failure: result,
          options,
          requestTimeoutMs: siteVerifyRequestTimeoutMs,
        });
      }

      return makeAuthCaptchaErrorResponse({
        code: AUTH_CAPTCHA_VERIFICATION_FAILED_ERROR_CODE,
        message: AUTH_CAPTCHA_VERIFICATION_FAILED_MESSAGE,
        status: 403,
      });
    },
    options: {
      endpoints,
      provider: options.provider,
      secretKey: options.secretKey,
      siteVerifyRequestTimeoutMs,
      ...(options.siteVerifyURLOverride === undefined
        ? {}
        : {
            siteVerifyURLOverride: options.siteVerifyURLOverride,
          }),
    },
  } satisfies BetterAuthPlugin;
}

export function makeAuthCaptchaProviderFailureReporter(
  runtimeContext: AuthEffectRuntimeContext = Context.empty(),
  scheduleReport?: ((task: Promise<unknown>) => void) | undefined
) {
  return (event: AuthCaptchaProviderFailureEvent) => {
    const report = Effect.runPromiseWith(runtimeContext)(
      Effect.logWarning(
        "Auth captcha provider unavailable; failing closed"
      ).pipe(
        Effect.annotateLogs({
          authAbuseAlertPolicy: "alert_on_sustained_captcha_provider_failure",
          authAbuseSignal: "captcha_provider_failure",
          authAbuseSignalSeverity: "high",
          authCaptchaEndpointPath: event.endpointPath,
          authCaptchaFailure: event.failure,
          authCaptchaFailureMode: event.failureMode,
          authCaptchaProvider: event.provider,
          authCaptchaRequestTimeoutMs: event.requestTimeoutMs,
          ...(event.providerErrorCodes === undefined
            ? {}
            : {
                authCaptchaProviderErrorCodes:
                  event.providerErrorCodes.join(","),
              }),
          ...(event.responseStatus === undefined
            ? {}
            : {
                authCaptchaProviderResponseStatus: event.responseStatus,
              }),
        })
      )
    );

    if (scheduleReport) {
      scheduleReport(report);
      return;
    }

    void ignoreAuthCaptchaProviderFailureReport(report);
  };
}

async function ignoreAuthCaptchaProviderFailureReport(
  report: Promise<unknown>
) {
  try {
    await report;
  } catch {
    // Provider telemetry must never replace the auth response.
  }
}

function resolveAuthCaptchaEndpointPath(
  request: Request,
  endpoints: readonly string[]
) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";

  return endpoints.find(
    (endpoint) => pathname === endpoint || pathname.endsWith(endpoint)
  );
}

function makeAuthCaptchaErrorResponse(input: {
  readonly code: string;
  readonly message: string;
  readonly status: number;
}) {
  return {
    response: Response.json(
      {
        code: input.code,
        message: input.message,
      },
      {
        status: input.status,
      }
    ),
  };
}

function verifyCloudflareTurnstileWithTimeout(options: {
  readonly captchaResponse: string;
  readonly remoteIP?: string | undefined;
  readonly requestTimeoutMs: number;
  readonly secretKey: string;
  readonly siteVerifyURL: string;
}): Promise<AuthCaptchaVerificationResult> {
  const controller = new AbortController();
  const timeoutError = new Error(
    `Turnstile siteverify request timed out after ${options.requestTimeoutMs}ms`
  );

  return Effect.runPromise(
    fetchCloudflareTurnstileSiteVerify({
      ...options,
      signal: controller.signal,
    }).pipe(
      Effect.timeoutOrElse({
        duration: Duration.millis(options.requestTimeoutMs),
        orElse: () =>
          Effect.succeed({
            cause: timeoutError,
            failure: "request_timed_out",
            status: "provider_failed",
          } satisfies AuthCaptchaVerificationResult),
      }),
      Effect.ensuring(Effect.sync(() => controller.abort(timeoutError)))
    )
  );
}

function fetchCloudflareTurnstileSiteVerify(options: {
  readonly captchaResponse: string;
  readonly remoteIP?: string | undefined;
  readonly secretKey: string;
  readonly signal: AbortSignal;
  readonly siteVerifyURL: string;
}): Effect.Effect<AuthCaptchaVerificationResult, never, never> {
  return Effect.tryPromise({
    try: () =>
      fetch(options.siteVerifyURL, {
        body: JSON.stringify({
          secret: options.secretKey,
          response: options.captchaResponse,
          ...(options.remoteIP === undefined
            ? {}
            : {
                remoteip: options.remoteIP,
              }),
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: options.signal,
      }),
    catch: (cause) =>
      ({
        cause,
        failure: "request_failed",
        status: "provider_failed",
      }) satisfies AuthCaptchaProviderFailureResult,
  }).pipe(
    Effect.result,
    Effect.andThen(
      (
        fetchResult
      ): Effect.Effect<AuthCaptchaVerificationResult, never, never> => {
        if (Result.isFailure(fetchResult)) {
          return succeedAuthCaptchaVerificationResult(fetchResult.failure);
        }

        const response = fetchResult.success;

        if (!response.ok) {
          return succeedAuthCaptchaVerificationResult({
            cause: new Error(
              `Turnstile siteverify failed with ${response.status}`
            ),
            failure: "request_failed",
            responseStatus: response.status,
            status: "provider_failed",
          });
        }

        return readCloudflareTurnstileSiteVerifyResponse(response);
      }
    )
  );
}

function readCloudflareTurnstileSiteVerifyResponse(
  response: Response
): Effect.Effect<AuthCaptchaVerificationResult, never, never> {
  return Effect.tryPromise({
    try: () => response.json(),
    catch: (cause) =>
      ({
        cause,
        failure: "invalid_response",
        responseStatus: response.status,
        status: "provider_failed",
      }) satisfies AuthCaptchaProviderFailureResult,
  }).pipe(
    Effect.result,
    Effect.andThen(
      (
        bodyResult
      ): Effect.Effect<AuthCaptchaVerificationResult, never, never> => {
        if (Result.isFailure(bodyResult)) {
          return succeedAuthCaptchaVerificationResult(bodyResult.failure);
        }

        return decodeCloudflareTurnstileSiteVerifyResponse(
          bodyResult.success
        ).pipe(
          Effect.result,
          Effect.andThen(
            (
              decodeResult
            ): Effect.Effect<AuthCaptchaVerificationResult, never, never> => {
              if (Result.isFailure(decodeResult)) {
                return succeedAuthCaptchaVerificationResult({
                  cause: decodeResult.failure,
                  failure: "invalid_response",
                  responseStatus: response.status,
                  status: "provider_failed",
                });
              }

              const result = decodeResult.success;

              return succeedAuthCaptchaVerificationResult(
                result.success
                  ? {
                      status: "verified",
                    }
                  : classifyCloudflareTurnstileFailure({
                      errorCodes: result["error-codes"] ?? [],
                      responseStatus: response.status,
                    })
              );
            }
          )
        );
      }
    )
  );
}

function succeedAuthCaptchaVerificationResult(
  result: AuthCaptchaVerificationResult
): Effect.Effect<AuthCaptchaVerificationResult, never, never> {
  return Effect.succeed(result);
}

function classifyCloudflareTurnstileFailure(input: {
  readonly errorCodes: readonly string[];
  readonly responseStatus: number;
}): AuthCaptchaVerificationResult {
  if (isTurnstileUserRejection(input.errorCodes)) {
    return {
      errorCodes: input.errorCodes,
      status: "rejected",
    };
  }

  return {
    cause: new Error("Turnstile siteverify reported a provider failure"),
    failure: "provider_error",
    providerErrorCodes: sanitizeTurnstileProviderErrorCodes(input.errorCodes),
    responseStatus: input.responseStatus,
    status: "provider_failed",
  };
}

function isTurnstileUserRejection(errorCodes: readonly string[]) {
  return (
    errorCodes.length > 0 &&
    errorCodes.every((errorCode) =>
      TURNSTILE_USER_REJECTION_ERROR_CODES.has(errorCode)
    )
  );
}

function sanitizeTurnstileProviderErrorCodes(errorCodes: readonly string[]) {
  if (errorCodes.length === 0) {
    return ["none"];
  }

  return errorCodes.map((errorCode) =>
    TURNSTILE_KNOWN_ERROR_CODES.has(errorCode) ? errorCode : "unknown"
  );
}

function reportAuthCaptchaProviderFailure(options: {
  readonly endpointPath: string;
  readonly failure: AuthCaptchaProviderFailureResult;
  readonly options: Pick<
    AuthCaptchaPluginOptions,
    "provider" | "reportProviderFailure"
  >;
  readonly requestTimeoutMs: number;
}) {
  try {
    options.options.reportProviderFailure?.({
      cause: options.failure.cause,
      endpointPath: options.endpointPath,
      failure: options.failure.failure,
      failureMode: "fail_closed",
      provider: options.options.provider,
      ...(options.failure.providerErrorCodes === undefined
        ? {}
        : {
            providerErrorCodes: options.failure.providerErrorCodes,
          }),
      requestTimeoutMs: options.requestTimeoutMs,
      ...(options.failure.responseStatus === undefined
        ? {}
        : {
            responseStatus: options.failure.responseStatus,
          }),
    });
  } catch {
    // Telemetry must never replace the captcha failure response.
  }
}
