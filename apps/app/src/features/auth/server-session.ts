import { createServerOnlyFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { resolveConfiguredServerAuthBaseURL } from "#/lib/auth-client.server";
import {
  normalizeServerApiCookieHeader,
  readServerApiForwardedHeaders,
} from "#/lib/server-api-forwarded-headers";

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

type ServerAuthSession = Schema.Schema.Type<typeof ServerAuthSessionSchema>;

export const getCurrentServerSession = createServerOnlyFn(async () => {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const cookie = getRequestHeader("cookie");
  const authBaseURL = resolveConfiguredServerAuthBaseURL();
  const forwardedHeaders = readServerApiForwardedHeaders({
    host: getRequestHeader("host"),
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
});

function decodeServerAuthSession(payload: unknown): ServerAuthSession | null {
  try {
    return Schema.decodeUnknownSync(ServerAuthSessionSchema)(payload);
  } catch {
    return null;
  }
}
