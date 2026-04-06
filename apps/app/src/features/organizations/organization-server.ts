import { createServerOnlyFn } from "@tanstack/react-start";
import {
  getRequestHeader,
  getRequestHost,
  getRequestProtocol,
  setResponseHeader,
} from "@tanstack/react-start/server";
import { Schema } from "effect";

import { resolveAuthBaseURL } from "#/lib/auth-client";

const OrganizationSummarySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  slug: Schema.String,
});

const OrganizationSummaryListSchema = Schema.Array(OrganizationSummarySchema);

const NullableString = Schema.NullOr(Schema.String);

const OrganizationAccessSessionSchema = Schema.Struct({
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

export type OrganizationSummary = Schema.Schema.Type<
  typeof OrganizationSummarySchema
>;

export type OrganizationAccessSession = Schema.Schema.Type<
  typeof OrganizationAccessSessionSchema
>;

interface ServerAuthRequest {
  cookie: string;
  authBaseURL: string;
}

export const getCurrentServerOrganizationSession = createServerOnlyFn(
  async (): Promise<OrganizationAccessSession | null> => {
    const authRequest = readServerSessionRequest();

    if (!authRequest) {
      return null;
    }

    const response = await fetch(
      new URL("get-session", `${authRequest.authBaseURL}/`),
      {
        headers: {
          accept: "application/json",
          cookie: authRequest.cookie,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Session lookup failed with status ${response.status}.`);
    }

    const session = (await response.json()) as unknown;

    if (session === null) {
      return null;
    }

    return decodeOrganizationAccessSession(session);
  }
);

export const listCurrentServerOrganizations = createServerOnlyFn(async () => {
  const authRequest = readServerAuthRequest();

  if (!authRequest) {
    return [] as const;
  }

  try {
    const response = await fetchOrganizations(authRequest);

    if (!response.ok) {
      return [] as const;
    }

    const organizations = (await response.json()) as unknown;
    return decodeOrganizationSummariesOrEmpty(organizations);
  } catch {
    return [] as const;
  }
});

export const getCurrentServerOrganizations = createServerOnlyFn(async () => {
  const authRequest = readServerAuthRequestStrict();
  const response = await fetchOrganizations(authRequest);

  if (!response.ok) {
    throw new Error(
      `Organization lookup failed with status ${response.status}.`
    );
  }

  const organizations = (await response.json()) as unknown;

  if (!organizations) {
    throw new Error("Organization lookup returned no data.");
  }

  return decodeOrganizationSummariesStrict(organizations);
});

export const setCurrentServerActiveOrganization = createServerOnlyFn(
  async (organizationId: string | null) => {
    const authRequest = readServerAuthRequestStrict();
    const response = await fetch(
      new URL("organization/set-active", `${authRequest.authBaseURL}/`),
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          cookie: authRequest.cookie,
        },
        body: JSON.stringify({ organizationId }),
      }
    );

    forwardResponseCookies(response);

    if (!response.ok) {
      throw new Error(
        `Setting active organization failed with status ${response.status}.`
      );
    }
  }
);

function readServerSessionRequest(): ServerAuthRequest | null {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    return null;
  }

  const authBaseURL = readServerAuthBaseURL();

  if (!authBaseURL) {
    throw new Error(
      "Cannot resolve the auth base URL for organization auth requests."
    );
  }

  return { cookie, authBaseURL };
}

function readServerAuthRequest(): ServerAuthRequest | null {
  const cookie = getRequestHeader("cookie");
  const authBaseURL = readServerAuthBaseURL();

  if (!cookie || !authBaseURL) {
    return null;
  }

  return { cookie, authBaseURL };
}

function readServerAuthRequestStrict(): ServerAuthRequest {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    throw new Error(
      "Cannot list organizations without the current auth cookie."
    );
  }

  const authBaseURL = readServerAuthBaseURL();

  if (!authBaseURL) {
    throw new Error(
      "Cannot resolve the auth base URL for organization auth requests."
    );
  }

  return { cookie, authBaseURL };
}

function readServerAuthBaseURL(): string | undefined {
  const serverAuthOrigin = readServerAuthOrigin();

  return resolveAuthBaseURL(
    `${getRequestProtocol()}://${getRequestHost()}`,
    serverAuthOrigin
  );
}

function readServerAuthOrigin(): string | undefined {
  if (typeof __SERVER_AUTH_ORIGIN__ === "string") {
    return __SERVER_AUTH_ORIGIN__;
  }

  const authOrigin = process.env.AUTH_ORIGIN;
  return typeof authOrigin === "string" ? authOrigin : undefined;
}

async function fetchOrganizations(authRequest: ServerAuthRequest) {
  return await fetch(
    new URL("organization/list", `${authRequest.authBaseURL}/`),
    {
      headers: {
        accept: "application/json",
        cookie: authRequest.cookie,
      },
    }
  );
}

function decodeOrganizationSummariesOrEmpty(
  organizations: unknown
): readonly OrganizationSummary[] {
  if (!organizations) {
    return [];
  }

  try {
    return Schema.decodeUnknownSync(OrganizationSummaryListSchema)(
      organizations
    );
  } catch {
    return [];
  }
}

function decodeOrganizationSummariesStrict(
  organizations: unknown
): readonly OrganizationSummary[] {
  try {
    return Schema.decodeUnknownSync(OrganizationSummaryListSchema)(
      organizations
    );
  } catch {
    throw new Error("Organization lookup returned an invalid payload.");
  }
}

export function decodeOrganizationAccessSession(
  session: unknown
): OrganizationAccessSession {
  try {
    Schema.decodeUnknownSync(OrganizationAccessSessionSchema)(session);
  } catch {
    throw new Error("Session lookup returned an invalid payload.");
  }

  return session as OrganizationAccessSession;
}

function forwardResponseCookies(response: Response) {
  const setCookieValues = getSetCookieValues(response.headers);

  if (setCookieValues.length === 0) {
    return;
  }

  setResponseHeader("set-cookie", setCookieValues);
}

function getSetCookieValues(headers: Headers) {
  const headersWithGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headersWithGetSetCookie.getSetCookie === "function") {
    return headersWithGetSetCookie.getSetCookie();
  }

  const value = headers.get("set-cookie");
  return value ? [value] : [];
}
