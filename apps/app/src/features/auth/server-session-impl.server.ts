import { Schema } from "effect";

import { resolveConfiguredServerAuthBaseURL } from "#/lib/auth-client.server";
import {
  normalizeServerApiCookieHeader,
  readServerApiForwardedHeaders,
} from "#/lib/server-api-forwarded-headers";

import { readGlobalAppServerContext } from "./app-server-context";
import type { ServerAuthSession } from "./server-session-types";

const NullableString = Schema.NullOr(Schema.String);

const ServerAuthSessionSchema = Schema.Struct({
  session: Schema.Struct({
    id: Schema.String,
    createdAt: Schema.String,
    updatedAt: Schema.String,
    userId: Schema.String,
    expiresAt: Schema.String,
    token: Schema.String,
    ipAddress: Schema.optional(NullableString),
    userAgent: Schema.optional(NullableString),
    activeOrganizationId: Schema.optional(NullableString),
  }),
  user: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
    image: Schema.optional(NullableString),
    emailVerified: Schema.Boolean,
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
});

export async function getCurrentServerSessionDirect() {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const cachedSession = readGlobalAppServerContext().authSession;

  if (cachedSession !== undefined) {
    return cachedSession;
  }

  return await readOptionalServerAuthSessionFromHeaders((name) =>
    getRequestHeader(name)
  );
}

export async function readOptionalServerAuthSessionFromRequest(
  request: Request
) {
  return await readOptionalServerAuthSessionFromHeaders(
    (name) => request.headers.get(name) ?? undefined
  );
}

async function readOptionalServerAuthSessionFromHeaders(
  getRequestHeader: (name: string) => string | undefined
) {
  const cookie = getRequestHeader("cookie");
  const authBaseURL = resolveConfiguredServerAuthBaseURL();
  const forwardedHeaders = readServerApiForwardedHeaders({
    forwardedHost: getRequestHeader("x-forwarded-host"),
    host: getRequestHeader("host"),
    origin: getRequestHeader("origin"),
    forwardedProto: getRequestHeader("x-forwarded-proto"),
  });

  if (!cookie || !authBaseURL) {
    return null;
  }

  const normalizedCookie = normalizeServerApiCookieHeader(cookie, authBaseURL);

  const response = await fetch(new URL("get-session", `${authBaseURL}/`), {
    headers: {
      accept: "application/json",
      cookie: normalizedCookie,
      ...forwardedHeaders,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;

  if (payload === null) {
    return null;
  }

  return decodeServerAuthSession(payload);
}

function decodeServerAuthSession(payload: unknown): ServerAuthSession | null {
  try {
    return Schema.decodeUnknownSync(ServerAuthSessionSchema)(payload);
  } catch {
    return null;
  }
}
