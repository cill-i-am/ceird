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
import {
  parseTenantHost,
  readTenantHostConfigFromEnv,
} from "#/lib/tenant-host";

import { decodeServerAuthSession } from "./app-context-types";
import type { AppAuthContextSnapshot } from "./app-context-types";
import type { ServerAuthSession } from "./server-session-types";

export type RequestHeaderReader = (name: string) => string | undefined;

export interface ServerAuthRequest {
  readonly authBaseURL: string;
  readonly cookie: string;
  readonly forwardedHeaders: ReturnType<typeof readServerApiForwardedHeaders>;
}

interface AuthRequestErrorContext {
  readonly cause?: unknown;
  readonly endpoint: string;
  readonly operation: string;
  readonly organizationId?: OrganizationId | undefined;
  readonly responsePreview?: string | undefined;
  readonly status?: number | undefined;
}

class ServerAuthContextError extends Error {
  readonly endpoint: string;
  readonly operation: string;
  readonly organizationId?: OrganizationId | undefined;
  readonly responsePreview?: string | undefined;
  readonly status?: number | undefined;

  constructor(message: string, context: AuthRequestErrorContext) {
    super(
      message,
      context.cause === undefined ? undefined : { cause: context.cause }
    );
    this.name = "ServerAuthContextError";
    this.endpoint = context.endpoint;
    this.operation = context.operation;
    this.organizationId = context.organizationId;
    this.responsePreview = context.responsePreview;
    this.status = context.status;
  }
}

function getHeaderFromRequest(request: Request): RequestHeaderReader {
  return (name) => request.headers.get(name) ?? undefined;
}

function readOptionalServerAuthRequest(
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

async function readOptionalServerAuthSessionForRequest(
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
  const requestedOrganizationSlug = readRequestedOrganizationSlug(request);

  if (
    !session ||
    !options.hydrateOrganizationContext ||
    (!options.resolveActiveOrganizationFromList && !activeOrganizationId)
  ) {
    return {
      activeOrganizationId,
      ...(requestedOrganizationSlug ? { requestedOrganizationSlug } : {}),
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
        ...(requestedOrganizationSlug ? { requestedOrganizationSlug } : {}),
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
      ...(requestedOrganizationSlug ? { requestedOrganizationSlug } : {}),
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
    organizations,
    requestedOrganizationSlug
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
    ...(requestedOrganizationSlug ? { requestedOrganizationSlug } : {}),
    session,
  };
}

export async function readOptionalServerAuthSessionFromHeaders(
  getRequestHeader: RequestHeaderReader
): Promise<ServerAuthSession | null> {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    return null;
  }

  const authBaseURL = resolveConfiguredServerAuthBaseURL();
  const endpoint = "get-session";

  if (!authBaseURL) {
    throw new ServerAuthContextError(
      "Cannot resolve the auth base URL for session lookup.",
      {
        endpoint,
        operation: "session_lookup",
      }
    );
  }

  const authRequest = buildServerAuthRequest(
    getRequestHeader,
    cookie,
    authBaseURL
  );
  const url = new URL(endpoint, `${authRequest.authBaseURL}/`);
  const response = await fetch(url, {
    headers: buildAuthReadHeaders(authRequest),
  }).catch((error: unknown) => {
    throw new ServerAuthContextError("Session lookup request failed.", {
      cause: error,
      endpoint,
      operation: "session_lookup",
    });
  });

  if (response.status === 401 || response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new ServerAuthContextError(
      `Session lookup failed with status ${response.status}.`,
      {
        endpoint,
        operation: "session_lookup",
        responsePreview: await readSafeResponsePreview(response),
        status: response.status,
      }
    );
  }

  const payload = (await response.json().catch((error: unknown) => {
    throw new ServerAuthContextError("Session lookup returned invalid JSON.", {
      cause: error,
      endpoint,
      operation: "session_lookup",
    });
  })) as unknown;

  if (payload === null) {
    return null;
  }

  try {
    return decodeServerAuthSession(payload);
  } catch (error) {
    throw new ServerAuthContextError(
      "Session lookup returned an invalid payload.",
      {
        cause: error,
        endpoint,
        operation: "session_lookup",
      }
    );
  }
}

export async function readServerOrganizations(
  authRequest: ServerAuthRequest
): Promise<readonly OrganizationSummary[]> {
  const endpoint = "organization/list";
  const response = await fetch(
    new URL(endpoint, `${authRequest.authBaseURL}/`),
    {
      headers: buildAuthReadHeaders(authRequest),
    }
  );

  if (!response.ok) {
    throw new ServerAuthContextError(
      `Organization lookup failed with status ${response.status}.`,
      {
        endpoint,
        operation: "organization_list",
        responsePreview: await readSafeResponsePreview(response),
        status: response.status,
      }
    );
  }

  const organizations = (await response.json().catch((error: unknown) => {
    throw new ServerAuthContextError(
      "Organization lookup returned invalid JSON.",
      {
        cause: error,
        endpoint,
        operation: "organization_list",
      }
    );
  })) as unknown;

  if (!organizations) {
    throw new ServerAuthContextError("Organization lookup returned no data.", {
      endpoint,
      operation: "organization_list",
    });
  }

  try {
    return decodeOrganizationSummaryList(organizations);
  } catch (error) {
    throw new ServerAuthContextError(
      "Organization lookup returned an invalid payload.",
      {
        cause: error,
        endpoint,
        operation: "organization_list",
      }
    );
  }
}

export async function readServerOrganizationMemberRole(
  authRequest: ServerAuthRequest,
  organizationId: OrganizationId
): Promise<OrganizationMemberRoleResponse> {
  const endpoint = "organization/get-active-member-role";
  const response = await fetch(
    new URL(
      `${endpoint}?organizationId=${encodeURIComponent(organizationId)}`,
      `${authRequest.authBaseURL}/`
    ),
    {
      headers: buildAuthReadHeaders(authRequest),
    }
  );

  if (!response.ok) {
    throw new ServerAuthContextError(
      `Organization member role lookup failed with status ${response.status}.`,
      {
        endpoint,
        operation: "organization_member_role",
        organizationId,
        responsePreview: await readSafeResponsePreview(response),
        status: response.status,
      }
    );
  }

  const role = (await response.json().catch((error: unknown) => {
    throw new ServerAuthContextError(
      "Organization member role lookup returned invalid JSON.",
      {
        cause: error,
        endpoint,
        operation: "organization_member_role",
        organizationId,
      }
    );
  })) as unknown;

  try {
    return decodeOrganizationMemberRoleResponse(role);
  } catch (error) {
    throw new ServerAuthContextError(
      "Organization member role lookup returned an invalid payload.",
      {
        cause: error,
        endpoint,
        operation: "organization_member_role",
        organizationId,
      }
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
  } catch (error) {
    logServerAuthContextWarning(
      "Organization member role hydration failed; continuing without optimized role context.",
      {
        cause: error,
        operation: "organization_member_role",
        organizationId,
      }
    );
  }
}

export async function readRequiredCurrentOrganizationRoleForRequest(
  request: Request,
  organizationId: OrganizationId
) {
  const memberRole = await readServerOrganizationMemberRole(
    readRequiredServerAuthRequest(getHeaderFromRequest(request)),
    organizationId
  );

  return memberRole.role;
}

function resolveActiveOrganizationId(
  activeOrganizationId: OrganizationId | null,
  organizations: readonly OrganizationSummary[],
  requestedOrganizationSlug?: string | undefined
): OrganizationId | null {
  if (requestedOrganizationSlug) {
    const requestedOrganization = organizations.find(
      (organization) => organization.slug === requestedOrganizationSlug
    );

    if (requestedOrganization) {
      return requestedOrganization.id;
    }
  }

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

function readRequestedOrganizationSlug(request: Request) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!host) {
    return;
  }

  const resolution = parseTenantHost(
    stripValidPort(host),
    readTenantHostConfigFromEnv()
  );

  return resolution.kind === "tenant" ? resolution.organizationSlug : undefined;
}

function stripValidPort(host: string) {
  const portSeparatorIndex = host.lastIndexOf(":");

  if (portSeparatorIndex === -1) {
    return host;
  }

  const port = host.slice(portSeparatorIndex + 1);

  if (!/^\d+$/u.test(port)) {
    return host;
  }

  const portNumber = Number(port);

  if (portNumber < 1 || portNumber > 65_535) {
    return host;
  }

  return host.slice(0, portSeparatorIndex);
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

async function readSafeResponsePreview(response: Response) {
  try {
    const bodyText = await response.text();
    return bodyText.slice(0, 256);
  } catch {
    return "";
  }
}

function logServerAuthContextWarning(
  message: string,
  context: Omit<AuthRequestErrorContext, "endpoint"> & {
    readonly endpoint?: string | undefined;
  }
) {
  console.warn(message, {
    cause: formatUnknownCause(context.cause),
    endpoint: context.endpoint,
    operation: context.operation,
    organizationId: context.organizationId,
    status: context.status,
  });
}

function formatUnknownCause(cause: unknown) {
  if (cause instanceof Error) {
    return cause.message;
  }

  if (cause === undefined) {
    return;
  }

  return String(cause);
}
