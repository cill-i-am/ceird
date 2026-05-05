import {
  decodeOrganizationMemberRoleResponse,
  decodeOrganizationSummaryList,
  OrganizationId,
} from "@ceird/identity-core";
import type {
  OrganizationId as OrganizationIdType,
  OrganizationMemberRoleResponse,
  OrganizationSummary,
} from "@ceird/identity-core";
import { createServerOnlyFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { resolveConfiguredServerAuthBaseURL } from "#/lib/auth-client.server";
import {
  normalizeServerApiCookieHeader,
  readServerApiForwardedHeaders,
} from "#/lib/server-api-forwarded-headers";

const NullableString = Schema.NullOr(Schema.String);
const NullableOrganizationId = Schema.NullOr(OrganizationId);

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
    activeOrganizationId: Schema.optional(NullableOrganizationId),
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

export type OrganizationAccessSession = Schema.Schema.Type<
  typeof OrganizationAccessSessionSchema
>;

export type OrganizationMemberRole = OrganizationMemberRoleResponse;

interface ServerAuthRequest {
  cookie: string;
  authBaseURL: string;
  forwardedHeaders?: ReturnType<typeof readServerApiForwardedHeaders>;
}

export const getCurrentServerOrganizationSession = createServerOnlyFn(
  async (): Promise<OrganizationAccessSession | null> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const authRequest = readServerSessionRequest(getRequestHeader);

    if (!authRequest) {
      return null;
    }

    const response = await fetch(
      new URL("get-session", `${authRequest.authBaseURL}/`),
      {
        headers: {
          accept: "application/json",
          cookie: authRequest.cookie,
          ...authRequest.forwardedHeaders,
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

export const getCurrentServerOrganizations = createServerOnlyFn(async () => {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const authRequest = readServerAuthRequestStrict(getRequestHeader);
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

export const getCurrentServerOrganizationMemberRole = createServerOnlyFn(
  async (
    organizationId: OrganizationIdType
  ): Promise<OrganizationMemberRole> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const authRequest = readServerAuthRequestStrict(getRequestHeader);
    const response = await fetch(
      new URL(
        `organization/get-active-member-role?organizationId=${encodeURIComponent(
          organizationId
        )}`,
        `${authRequest.authBaseURL}/`
      ),
      {
        headers: {
          accept: "application/json",
          cookie: authRequest.cookie,
          ...authRequest.forwardedHeaders,
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Organization member role lookup failed with status ${response.status}.`
      );
    }

    const role = (await response.json()) as unknown;
    return decodeOrganizationMemberRole(role);
  }
);

export const setCurrentServerActiveOrganization = createServerOnlyFn(
  async (organizationId: OrganizationIdType): Promise<void> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const authRequest = readServerAuthRequestStrict(getRequestHeader);
    const response = await fetch(
      new URL("organization/set-active", `${authRequest.authBaseURL}/`),
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          cookie: authRequest.cookie,
          ...authRequest.forwardedHeaders,
        },
        body: JSON.stringify({ organizationId }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Active organization sync failed with status ${response.status}.`
      );
    }
  }
);

function readServerSessionRequest(
  getRequestHeader: (name: string) => string | undefined
): ServerAuthRequest | null {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    return null;
  }

  const authBaseURL = readServerAuthBaseURL();
  const forwardedHeaders = readServerApiForwardedHeaders({
    host: getRequestHeader("host"),
    forwardedProto: getRequestHeader("x-forwarded-proto"),
  });

  if (!authBaseURL) {
    throw new Error(
      "Cannot resolve the auth base URL for organization auth requests."
    );
  }

  return {
    cookie: normalizeServerApiCookieHeader(cookie, authBaseURL),
    authBaseURL,
    forwardedHeaders,
  };
}

function readServerAuthRequestStrict(
  getRequestHeader: (name: string) => string | undefined
): ServerAuthRequest {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    throw new Error(
      "Cannot list organizations without the current auth cookie."
    );
  }

  const authBaseURL = readServerAuthBaseURL();
  const forwardedHeaders = readServerApiForwardedHeaders({
    host: getRequestHeader("host"),
    forwardedProto: getRequestHeader("x-forwarded-proto"),
  });

  if (!authBaseURL) {
    throw new Error(
      "Cannot resolve the auth base URL for organization auth requests."
    );
  }

  return {
    cookie: normalizeServerApiCookieHeader(cookie, authBaseURL),
    authBaseURL,
    forwardedHeaders,
  };
}

function readServerAuthBaseURL(): string | undefined {
  return resolveConfiguredServerAuthBaseURL();
}

async function fetchOrganizations(authRequest: ServerAuthRequest) {
  return await fetch(
    new URL("organization/list", `${authRequest.authBaseURL}/`),
    {
      headers: {
        accept: "application/json",
        cookie: authRequest.cookie,
        ...authRequest.forwardedHeaders,
      },
    }
  );
}

function decodeOrganizationSummariesStrict(
  organizations: unknown
): readonly OrganizationSummary[] {
  try {
    return decodeOrganizationSummaryList(organizations);
  } catch {
    throw new Error("Organization lookup returned an invalid payload.");
  }
}

export function decodeOrganizationAccessSession(
  session: unknown
): OrganizationAccessSession {
  try {
    return Schema.decodeUnknownSync(OrganizationAccessSessionSchema)(session);
  } catch {
    throw new Error("Session lookup returned an invalid payload.");
  }
}

export function decodeOrganizationMemberRole(
  role: unknown
): OrganizationMemberRole {
  try {
    return decodeOrganizationMemberRoleResponse(role);
  } catch {
    throw new Error(
      "Organization member role lookup returned an invalid payload."
    );
  }
}
