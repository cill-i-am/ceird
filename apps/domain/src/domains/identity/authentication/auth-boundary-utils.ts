import type { Context } from "effect";

import type { AuthenticationConfig } from "./config.js";

export const OAUTH_SECURITY_AUDIT_MAX_REQUEST_BODY_BYTES = 16 * 1024;
export const AUTH_RATE_LIMIT_MAX_REQUEST_BODY_BYTES =
  OAUTH_SECURITY_AUDIT_MAX_REQUEST_BODY_BYTES;
export const DEFAULT_BETTER_AUTH_COOKIE_PREFIX = "better-auth";

export type AuthEffectRuntimeContext = Context.Context<never>;

export interface AuthenticationSessionResult {
  readonly session: {
    readonly createdAt: Date | string;
    readonly expiresAt: Date | string;
    readonly id: string;
    readonly ipAddress?: string | null | undefined;
    readonly token: string;
    readonly updatedAt: Date | string;
    readonly activeOrganizationId?: string | null | undefined;
    readonly userAgent?: string | null | undefined;
    readonly userId: string;
  } & Record<string, unknown>;
  readonly user: {
    readonly createdAt: Date | string;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly id: string;
    readonly image?: string | null | undefined;
    readonly name: string;
    readonly twoFactorEnabled: boolean;
    readonly updatedAt: Date | string;
  } & Record<string, unknown>;
}

export interface RawAuthenticationSessionResult {
  readonly session: AuthenticationSessionResult["session"];
  readonly user: {
    readonly createdAt: Date | string;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly id: string;
    readonly image?: string | null | undefined;
    readonly name: string;
    readonly twoFactorEnabled?: boolean | null | undefined;
    readonly updatedAt: Date | string;
  } & Record<string, unknown>;
}

export type AuthenticationRateLimitRequestBodyReadFailureReason =
  | "body_too_large"
  | "invalid_body"
  | "read_failed"
  | "unsupported_content_type";

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

export function decodeIdentityBoundaryValue<A>(
  input: unknown,
  decode: (input: unknown) => A
): A | null {
  try {
    return decode(input);
  } catch {
    return null;
  }
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

  return contentLength === null ? null : Number(contentLength);
}

export async function readBoundedJsonRecordRequestBody(
  request: Request,
  endpointPath: string
) {
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

    const body = JSON.parse(bodyText);

    if (!isRecord(body)) {
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

export function readStringField(
  value: Record<string, unknown> | null,
  field: string
) {
  const fieldValue = value?.[field];
  return typeof fieldValue === "string" && fieldValue.length > 0
    ? fieldValue
    : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
