import {
  decodeOrganizationId,
  decodeOrganizationMemberRoleResponse,
  decodeOrganizationSummaryList,
} from "@ceird/identity-core";
import type {
  OrganizationId,
  OrganizationMemberRoleResponse,
  OrganizationSummary,
} from "@ceird/identity-core";

import { resolveConfiguredServerAuthBaseURL } from "#/lib/auth-client.server";
import {
  normalizeServerApiCookieHeader,
  readServerApiForwardedHeaders,
} from "#/lib/server-api-forwarded-headers";

import { decodeServerAuthSession } from "./app-context-types";
import type { AppAuthContextSnapshot } from "./app-context-types";
import type { ServerAuthSession } from "./server-session-types";

export type RequestHeaderReader = (name: string) => string | undefined;

export interface ServerAuthRequest {
  readonly authBaseURL: string;
  readonly cookie: string;
  readonly forwardedHeaders: ReturnType<typeof readServerApiForwardedHeaders>;
}

export function getHeaderFromRequest(request: Request): RequestHeaderReader {
  return (name) => request.headers.get(name) ?? undefined;
}

export function readOptionalServerAuthRequest(
  getRequestHeader: RequestHeaderReader
): ServerAuthRequest | null {
  const cookie = getRequestHeader("cookie");
  const authBaseURL = resolveConfiguredServerAuthBaseURL();

  if (!cookie || !authBaseURL) {
    return null;
  }

  return buildServerAuthRequest(getRequestHeader, cookie, authBaseURL);
}

export function readRequiredServerAuthRequest(
  getRequestHeader: RequestHeaderReader
): ServerAuthRequest {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    throw new Error(
      "Cannot read server auth context without the current auth cookie."
    );
  }

  const authBaseURL = resolveConfiguredServerAuthBaseURL();

  if (!authBaseURL) {
    throw new Error(
      "Cannot resolve the auth base URL for organization auth requests."
    );
  }

  return buildServerAuthRequest(getRequestHeader, cookie, authBaseURL);
}

export function readOptionalStrictSessionAuthRequest(
  getRequestHeader: RequestHeaderReader
): ServerAuthRequest | null {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    return null;
  }

  const authBaseURL = resolveConfiguredServerAuthBaseURL();

  if (!authBaseURL) {
    throw new Error(
      "Cannot resolve the auth base URL for organization auth requests."
    );
  }

  return buildServerAuthRequest(getRequestHeader, cookie, authBaseURL);
}

export async function readOptionalServerAuthSessionForRequest(
  request: Request
): Promise<ServerAuthSession | null> {
  return await readOptionalServerAuthSessionFromHeaders(
    getHeaderFromRequest(request)
  );
}

export async function buildAppAuthContextSnapshotForRequest(
  request: Request,
  options: {
    readonly hydrateOrganizationContext?: boolean;
    readonly resolveActiveOrganizationFromList?: boolean;
    readonly session?: ServerAuthSession | null | undefined;
  } = {}
): Promise<AppAuthContextSnapshot> {
  const session =
    options.session === undefined
      ? await readOptionalServerAuthSessionForRequest(request)
      : options.session;
  const activeOrganizationId = session?.session.activeOrganizationId
    ? decodeOrganizationId(session.session.activeOrganizationId)
    : null;

  if (
    !session ||
    !options.hydrateOrganizationContext ||
    (!options.resolveActiveOrganizationFromList && !activeOrganizationId)
  ) {
    return {
      activeOrganizationId,
      session,
    };
  }

  const authRequest = readOptionalServerAuthRequest(
    getHeaderFromRequest(request)
  );

  if (!authRequest) {
    throw new Error("Cannot read organization auth context for this request.");
  }

  if (!options.resolveActiveOrganizationFromList) {
    if (!activeOrganizationId) {
      return {
        activeOrganizationId,
        session,
      };
    }

    const [organizations, currentOrganizationRole] = await Promise.all([
      readServerOrganizations(authRequest),
      readCurrentOrganizationRole(authRequest, activeOrganizationId),
    ]);

    return {
      activeOrganizationId,
      currentOrganizationRole,
      organizations,
      session,
    };
  }

  const organizationsPromise = readServerOrganizations(authRequest);
  const activeOrganizationRolePromise = activeOrganizationId
    ? readCurrentOrganizationRole(authRequest, activeOrganizationId)
    : undefined;
  const organizations = await organizationsPromise;
  const resolvedActiveOrganizationId = resolveActiveOrganizationId(
    activeOrganizationId,
    organizations
  );
  const activeOrganizationRole =
    activeOrganizationRolePromise === undefined
      ? undefined
      : await activeOrganizationRolePromise;
  let currentOrganizationRole;

  if (resolvedActiveOrganizationId !== null) {
    currentOrganizationRole =
      resolvedActiveOrganizationId === activeOrganizationId
        ? activeOrganizationRole
        : await readCurrentOrganizationRole(
            authRequest,
            resolvedActiveOrganizationId
          );
  }

  return {
    activeOrganizationId: resolvedActiveOrganizationId,
    currentOrganizationRole,
    organizations,
    session,
  };
}

export async function readOptionalServerAuthSessionFromHeaders(
  getRequestHeader: RequestHeaderReader
): Promise<ServerAuthSession | null> {
  const authRequest = readOptionalServerAuthRequest(getRequestHeader);

  if (!authRequest) {
    return null;
  }

  try {
    const response = await fetch(
      new URL("get-session", `${authRequest.authBaseURL}/`),
      {
        headers: buildAuthReadHeaders(authRequest),
      }
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;

    if (payload === null) {
      return null;
    }

    return decodeServerAuthSession(payload);
  } catch {
    return null;
  }
}

export async function readServerOrganizations(
  authRequest: ServerAuthRequest
): Promise<readonly OrganizationSummary[]> {
  const response = await fetch(
    new URL("organization/list", `${authRequest.authBaseURL}/`),
    {
      headers: buildAuthReadHeaders(authRequest),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Organization lookup failed with status ${response.status}.`
    );
  }

  const organizations = (await response.json()) as unknown;

  if (!organizations) {
    throw new Error("Organization lookup returned no data.");
  }

  try {
    return decodeOrganizationSummaryList(organizations);
  } catch {
    throw new Error("Organization lookup returned an invalid payload.");
  }
}

export async function readServerOrganizationMemberRole(
  authRequest: ServerAuthRequest,
  organizationId: OrganizationId
): Promise<OrganizationMemberRoleResponse> {
  const response = await fetch(
    new URL(
      `organization/get-active-member-role?organizationId=${encodeURIComponent(
        organizationId
      )}`,
      `${authRequest.authBaseURL}/`
    ),
    {
      headers: buildAuthReadHeaders(authRequest),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Organization member role lookup failed with status ${response.status}.`
    );
  }

  const role = (await response.json()) as unknown;

  try {
    return decodeOrganizationMemberRoleResponse(role);
  } catch {
    throw new Error(
      "Organization member role lookup returned an invalid payload."
    );
  }
}

async function readCurrentOrganizationRole(
  authRequest: ServerAuthRequest,
  organizationId: OrganizationId
) {
  try {
    const memberRole = await readServerOrganizationMemberRole(
      authRequest,
      organizationId
    );

    return memberRole.role;
  } catch {
    // Role is an optimization here; route-level guards still enforce access.
  }
}

function resolveActiveOrganizationId(
  activeOrganizationId: OrganizationId | null,
  organizations: readonly OrganizationSummary[]
): OrganizationId | null {
  if (!activeOrganizationId) {
    return organizations[0]?.id ?? null;
  }

  return (
    organizations.find(
      (organization) => organization.id === activeOrganizationId
    )?.id ??
    organizations[0]?.id ??
    null
  );
}

export function buildAuthReadHeaders(authRequest: ServerAuthRequest) {
  return {
    accept: "application/json",
    cookie: authRequest.cookie,
    ...authRequest.forwardedHeaders,
  };
}

function buildServerAuthRequest(
  getRequestHeader: RequestHeaderReader,
  cookie: string,
  authBaseURL: string
): ServerAuthRequest {
  const forwardedHeaders = readServerApiForwardedHeaders({
    forwardedHost: getRequestHeader("x-forwarded-host"),
    host: getRequestHeader("host"),
    origin: getRequestHeader("origin"),
    forwardedProto: getRequestHeader("x-forwarded-proto"),
  });

  return {
    authBaseURL,
    cookie: normalizeServerApiCookieHeader(cookie, authBaseURL),
    forwardedHeaders,
  };
}
