import { OrganizationId, SessionId, UserId } from "@ceird/identity-core";
import { Effect, Option, Schema } from "effect";
import type { Context } from "effect";

import type { AuthenticationConfig } from "./config.js";

export const OAUTH_SECURITY_AUDIT_MAX_REQUEST_BODY_BYTES = 16 * 1024;
export const AUTH_RATE_LIMIT_MAX_REQUEST_BODY_BYTES =
  OAUTH_SECURITY_AUDIT_MAX_REQUEST_BODY_BYTES;
export const DEFAULT_BETTER_AUTH_COOKIE_PREFIX = "better-auth";

export type AuthEffectRuntimeContext = Context.Context<never>;

const AuthenticationDateFromString = Schema.DateFromString.pipe(
  Schema.check(Schema.isDateValid())
);
const AuthenticationDate = Schema.Union([
  Schema.DateValid,
  AuthenticationDateFromString,
]);
const NullableString = Schema.NullOr(Schema.String).pipe(
  Schema.withDecodingDefault(Effect.succeed(null))
);
const NullableOrganizationId = Schema.NullOr(OrganizationId).pipe(
  Schema.withDecodingDefault(Effect.succeed(null))
);

export const BetterAuthSessionSchema = Schema.Struct({
  activeOrganizationId: NullableOrganizationId,
  createdAt: AuthenticationDate,
  expiresAt: AuthenticationDate,
  id: SessionId,
  ipAddress: NullableString,
  token: Schema.NonEmptyString,
  updatedAt: AuthenticationDate,
  userAgent: NullableString,
  userId: UserId,
});

export const BetterAuthSessionUserSchema = Schema.Struct({
  createdAt: AuthenticationDate,
  email: Schema.NonEmptyString,
  emailVerified: Schema.Boolean,
  id: UserId,
  image: NullableString,
  name: Schema.String,
  twoFactorEnabled: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(false))
  ),
  updatedAt: AuthenticationDate,
});

export const AuthenticationSessionResultSchema = Schema.Struct({
  session: BetterAuthSessionSchema,
  user: BetterAuthSessionUserSchema,
});
export type AuthenticationSessionResult = Schema.Schema.Type<
  typeof AuthenticationSessionResultSchema
>;

export const AuthBoundaryRecordSchema = Schema.Record(
  Schema.String,
  Schema.Unknown
);
export type AuthBoundaryRecord = Schema.Schema.Type<
  typeof AuthBoundaryRecordSchema
>;

const HttpContentLengthSchema = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
);
const DecodedHttpContentLengthSchema = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
);
const decodeHttpContentLength = Schema.decodeUnknownOption(
  HttpContentLengthSchema
);

export const AuthBoundaryRequestEnvelopeSchema = Schema.Struct({
  contentLength: Schema.NullOr(DecodedHttpContentLengthSchema),
  contentType: Schema.String,
  endpointPath: Schema.NonEmptyString,
  method: Schema.NonEmptyString,
});
export type AuthBoundaryRequestEnvelope = Schema.Schema.Type<
  typeof AuthBoundaryRequestEnvelopeSchema
>;

export type AuthenticationRateLimitRequestBodyReadFailureReason =
  | "body_too_large"
  | "invalid_body"
  | "read_failed"
  | "unsupported_content_type";

export type AuthBoundaryRequestBodyReadResult<T> =
  | {
      readonly body: T | null;
      readonly status: "available";
    }
  | {
      readonly reason: AuthenticationRateLimitRequestBodyReadFailureReason;
      readonly status: "unavailable";
    };

export class AuthRateLimitRequestBodyUnavailableError extends Error {
  readonly endpointPath: string;
  readonly reason: AuthenticationRateLimitRequestBodyReadFailureReason;

  constructor(options: {
    readonly endpointPath: string;
    readonly reason: AuthenticationRateLimitRequestBodyReadFailureReason;
  }) {
    super("Authentication rate-limit request body could not be read.");
    this.name = "AuthRateLimitRequestBodyUnavailableError";
    this.endpointPath = options.endpointPath;
    this.reason = options.reason;
  }
}

export function maskInvitationEmail(email: string) {
  const [localPart, domainPart] = email.split("@");

  if (!localPart || !domainPart) {
    return "***";
  }

  const [domainLabel, ...domainSuffix] = domainPart.split(".");
  const maskedDomainLabel = domainLabel ? `${domainLabel[0]}***` : "***";

  return `${localPart[0]}***@${maskedDomainLabel}${domainSuffix.length > 0 ? `.${domainSuffix.join(".")}` : ""}`;
}

export function decodeAuthBoundaryOption<S extends Schema.Decoder<unknown>>(
  schema: S,
  input: unknown
): Option.Option<S["Type"]> {
  return Schema.decodeUnknownOption(schema)(input);
}

export function resolveActiveAuthenticationSecret(
  authConfig: Pick<AuthenticationConfig, "secret" | "secrets">
) {
  return authConfig.secrets?.[0]?.value ?? authConfig.secret;
}

export function makeRequestLocalAuthenticationSessionResolver(
  resolveSession: (
    request: Request
  ) => Promise<AuthenticationSessionResult | null>
) {
  const sessionByRequest = new WeakMap<
    Request,
    Promise<AuthenticationSessionResult | null>
  >();

  return (request: Request) => {
    const cachedSession = sessionByRequest.get(request);

    if (cachedSession) {
      return cachedSession;
    }

    const nextSession = resolveSession(request);
    sessionByRequest.set(request, nextSession);

    return nextSession;
  };
}

export function resolveAuthenticationEndpointPath(
  request: Request,
  basePath: string
) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";

  if (basePath === "/" || basePath === "") {
    return pathname;
  }

  if (pathname === basePath) {
    return "/";
  }

  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length).replace(/\/+$/, "") || "/";
  }

  return pathname;
}

export function makeAuthBoundaryRequestEnvelope(
  request: Request,
  basePath: string
) {
  return Schema.decodeUnknownSync(AuthBoundaryRequestEnvelopeSchema)({
    contentLength: readRequestContentLength(request),
    contentType: request.headers.get("content-type") ?? "",
    endpointPath: resolveAuthenticationEndpointPath(request, basePath),
    method: request.method,
  });
}

export async function readLimitedRequestText(
  request: Request,
  maxBodyBytes: number
) {
  const reader = request.clone().body?.getReader();

  if (!reader) {
    return "";
  }

  const decoder = new TextDecoder();
  let byteCount = 0;
  let bodyText = "";

  while (true) {
    const readResult = await reader.read();

    if (readResult.done) {
      return bodyText + decoder.decode();
    }

    byteCount += readResult.value.byteLength;

    if (byteCount > maxBodyBytes) {
      void cancelRequestReader(reader);
      return null;
    }

    bodyText += decoder.decode(readResult.value, { stream: true });
  }
}

async function cancelRequestReader(
  reader: ReadableStreamDefaultReader<Uint8Array>
) {
  try {
    await reader.cancel();
  } catch {
    // Best-effort cancellation only; callers already stop processing the body.
  }
}

export function readRequestContentLength(request: Request) {
  const contentLength = request.headers.get("content-length");

  return contentLength === null
    ? null
    : Option.getOrNull(decodeHttpContentLength(contentLength));
}

export async function readAuthBoundaryJsonRequestBody<
  S extends Schema.Decoder<unknown>,
>(
  request: Request,
  endpointPath: string,
  schema: S
): Promise<S["Type"] | null> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const contentLength = readRequestContentLength(request);

    if (
      contentLength !== null &&
      Number.isFinite(contentLength) &&
      contentLength > AUTH_RATE_LIMIT_MAX_REQUEST_BODY_BYTES
    ) {
      throw new AuthRateLimitRequestBodyUnavailableError({
        endpointPath,
        reason: "body_too_large",
      });
    }

    if (!contentType.includes("application/json")) {
      if (request.body === null || contentLength === 0) {
        return null;
      }

      throw new AuthRateLimitRequestBodyUnavailableError({
        endpointPath,
        reason: "unsupported_content_type",
      });
    }

    const bodyText = await readLimitedRequestText(
      request,
      AUTH_RATE_LIMIT_MAX_REQUEST_BODY_BYTES
    );

    if (bodyText === null) {
      throw new AuthRateLimitRequestBodyUnavailableError({
        endpointPath,
        reason: "body_too_large",
      });
    }

    if (bodyText.length === 0) {
      return null;
    }

    const parsedBody = decodeJsonBodyText(bodyText);

    if (parsedBody.status === "invalid") {
      throw new AuthRateLimitRequestBodyUnavailableError({
        endpointPath,
        reason: "invalid_body",
      });
    }

    const body = Option.getOrNull(
      Schema.decodeUnknownOption(schema)(parsedBody.value)
    );

    if (body === null) {
      throw new AuthRateLimitRequestBodyUnavailableError({
        endpointPath,
        reason: "invalid_body",
      });
    }

    return body;
  } catch (error) {
    if (error instanceof AuthRateLimitRequestBodyUnavailableError) {
      throw error;
    }

    throw new AuthRateLimitRequestBodyUnavailableError({
      endpointPath,
      reason: "read_failed",
    });
  }
}

export async function readAuthBoundaryJsonOrFormRequestBody<
  S extends Schema.Decoder<unknown>,
>(
  request: Request,
  maxBodyBytes: number,
  schema: S,
  options: {
    readonly allowEmptyUnsupportedContentType?: boolean | undefined;
    readonly rejectDuplicateFormFields?: readonly string[] | undefined;
  } = {}
): Promise<AuthBoundaryRequestBodyReadResult<S["Type"]>> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const contentLength = readRequestContentLength(request);

    if (contentLength !== null && contentLength > maxBodyBytes) {
      return {
        reason: "body_too_large",
        status: "unavailable",
      };
    }

    if (
      !contentType.includes("application/json") &&
      !contentType.includes("application/x-www-form-urlencoded")
    ) {
      return options.allowEmptyUnsupportedContentType !== false &&
        (request.body === null || contentLength === 0)
        ? {
            body: null,
            status: "available",
          }
        : {
            reason: "unsupported_content_type",
            status: "unavailable",
          };
    }

    const bodyText = await readLimitedRequestText(request, maxBodyBytes);

    if (bodyText === null) {
      return {
        reason: "body_too_large",
        status: "unavailable",
      };
    }

    if (bodyText.length === 0) {
      return {
        body: null,
        status: "available",
      };
    }

    const rawBody = contentType.includes("application/json")
      ? decodeJsonBodyText(bodyText)
      : {
          status: "decoded" as const,
          value: parseAuthBoundaryFormBody(bodyText, options),
        };

    if (rawBody.status === "invalid" || rawBody.value === null) {
      return {
        reason: "invalid_body",
        status: "unavailable",
      };
    }

    const body = Option.getOrNull(
      Schema.decodeUnknownOption(schema)(rawBody.value)
    );

    return body === null
      ? {
          reason: "invalid_body",
          status: "unavailable",
        }
      : {
          body,
          status: "available",
        };
  } catch {
    return {
      reason: "read_failed",
      status: "unavailable",
    };
  }
}

function decodeJsonBodyText(
  bodyText: string
):
  | { readonly status: "decoded"; readonly value: unknown }
  | { readonly status: "invalid" } {
  return Option.match(
    Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(bodyText),
    {
      onNone: () => ({ status: "invalid" }),
      onSome: (value) => ({ status: "decoded", value }),
    }
  );
}

function parseAuthBoundaryFormBody(
  bodyText: string,
  options: {
    readonly rejectDuplicateFormFields?: readonly string[] | undefined;
  }
) {
  const params = new URLSearchParams(bodyText);

  if (
    options.rejectDuplicateFormFields?.some(
      (field) => params.getAll(field).length > 1
    ) === true
  ) {
    return null;
  }

  return Object.fromEntries(params.entries());
}

export function sanitizeAuthFailureLogValue(value: string) {
  return value
    .replaceAll(/ceird-auth-abuse:[^\s,]+/g, "[redacted-rate-limit-key]")
    .replaceAll(
      /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
      "[redacted-ip]"
    )
    .replaceAll(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[redacted-email]")
    .replaceAll(/https?:\/\/[^\s]+/g, "[redacted-url]")
    .replaceAll(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted-token]");
}

export function serializeUnknownCause(error: unknown) {
  return sanitizeAuthFailureLogValue(
    error instanceof Error ? error.message : String(error)
  );
}
