import {
  appendOrganizationSlugSuffix,
  createOrganizationSlugFromName,
  decodeOrganizationSummary,
} from "@ceird/identity-core";
import type {
  CreateOrganizationNameInput,
  OrganizationId as OrganizationIdType,
  OrganizationMemberRoleResponse,
  OrganizationSummary,
} from "@ceird/identity-core";

import { decodeServerAuthSession } from "../auth/app-context-types";
import { readGlobalAppServerContext } from "../auth/app-server-context";
import {
  buildAuthReadHeaders,
  readOptionalStrictSessionAuthRequest,
  readRequiredServerAuthRequest,
  readServerOrganizationMemberRole,
  readServerOrganizations,
} from "../auth/auth-request-context.server";
import type { ServerAuthRequest } from "../auth/auth-request-context.server";
import type { ServerAuthSession } from "../auth/server-session-types";
import { getCreateOrganizationFailureMessage } from "./organization-auth-errors";

const ORGANIZATION_SLUG_CONFLICT_MARKERS = [
  "ORGANIZATION_ALREADY_EXISTS",
  "ORGANIZATION_SLUG_ALREADY_TAKEN",
  "Organization already exists",
  "Organization slug already taken",
] as const;

export type OrganizationAccessSession = ServerAuthSession;
export type OrganizationMemberRole = OrganizationMemberRoleResponse;

export async function createCurrentServerOrganizationDirect(
  input: CreateOrganizationNameInput
): Promise<OrganizationSummary> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const authRequest = readRequiredServerAuthRequest(getRequestHeader);
  const baseSlug = createOrganizationSlugFromName(input.name);
  const response = await postCreateOrganization(authRequest, {
    name: input.name,
    slug: baseSlug,
  });

  if (response.ok) {
    return await finalizeCreatedOrganization(authRequest, response);
  }

  if (await isOrganizationSlugConflictResponse(response)) {
    const retrySlug = appendOrganizationSlugSuffix(
      baseSlug,
      crypto.randomUUID().slice(0, 8)
    );
    const retryResponse = await postCreateOrganization(authRequest, {
      name: input.name,
      slug: retrySlug,
    });

    if (retryResponse.ok) {
      return await finalizeCreatedOrganization(authRequest, retryResponse);
    }

    return await throwCreateOrganizationError(retryResponse);
  }

  return await throwCreateOrganizationError(response);
}

async function finalizeCreatedOrganization(
  authRequest: ServerAuthRequest,
  response: Response
): Promise<OrganizationSummary> {
  const organization = await readCreatedOrganization(response);
  const setCookies = [...readSetCookieHeaders(response.headers)];
  const activeOrganizationResponse = await trySetCreatedOrganizationActive(
    authRequest,
    organization.id
  );

  if (activeOrganizationResponse?.ok) {
    setCookies.push(
      ...readSetCookieHeaders(activeOrganizationResponse.headers)
    );
  }

  await forwardAuthSetCookies(setCookies);

  return organization;
}

export async function getCurrentServerOrganizationSessionDirect(): Promise<OrganizationAccessSession | null> {
  const cachedSession = readGlobalAppServerContext().authSession;

  if (cachedSession !== undefined) {
    return cachedSession;
  }

  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const authRequest = readOptionalStrictSessionAuthRequest(getRequestHeader);

  if (!authRequest) {
    return null;
  }

  const response = await fetch(
    new URL("get-session", `${authRequest.authBaseURL}/`),
    {
      headers: {
        ...buildAuthReadHeaders(authRequest),
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

export async function getCurrentServerOrganizationsDirect() {
  const cachedOrganizations = readGlobalAppServerContext().organizations;

  if (cachedOrganizations !== undefined) {
    return cachedOrganizations;
  }

  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const authRequest = readRequiredServerAuthRequest(getRequestHeader);
  return await readServerOrganizations(authRequest);
}

export async function getCurrentServerOrganizationMemberRoleDirect(
  organizationId: OrganizationIdType
): Promise<OrganizationMemberRole> {
  const appServerContext = readGlobalAppServerContext();
  const cachedRole = appServerContext.currentOrganizationRole;
  const cachedRoleOrganizationId =
    appServerContext.authSession?.session.activeOrganizationId;

  if (cachedRole !== undefined && cachedRoleOrganizationId === organizationId) {
    return { role: cachedRole };
  }

  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const authRequest = readRequiredServerAuthRequest(getRequestHeader);
  return await readServerOrganizationMemberRole(authRequest, organizationId);
}

export async function setCurrentServerActiveOrganizationDirect(
  organizationId: OrganizationIdType
): Promise<void> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const authRequest = readRequiredServerAuthRequest(getRequestHeader);
  const response = await postSetActiveOrganization(authRequest, organizationId);

  if (!response.ok) {
    throw new Error(
      `Active organization sync failed with status ${response.status}.`
    );
  }
}

async function postCreateOrganization(
  authRequest: ServerAuthRequest,
  input: { name: string; slug: string }
) {
  return await fetch(
    new URL("organization/create", `${authRequest.authBaseURL}/`),
    {
      body: JSON.stringify(input),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        cookie: authRequest.cookie,
        ...authRequest.forwardedHeaders,
      },
      method: "POST",
    }
  );
}

async function postSetActiveOrganization(
  authRequest: ServerAuthRequest,
  organizationId: OrganizationIdType
) {
  return await fetch(
    new URL("organization/set-active", `${authRequest.authBaseURL}/`),
    {
      body: JSON.stringify({ organizationId }),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        cookie: authRequest.cookie,
        ...authRequest.forwardedHeaders,
      },
      method: "POST",
    }
  );
}

async function trySetCreatedOrganizationActive(
  authRequest: ServerAuthRequest,
  organizationId: OrganizationIdType
) {
  try {
    return await postSetActiveOrganization(authRequest, organizationId);
  } catch {
    return null;
  }
}

async function isOrganizationSlugConflictResponse(response: Response) {
  if (response.status !== 400) {
    return false;
  }

  const bodyText = await response
    .clone()
    .text()
    .catch(() => "");

  return ORGANIZATION_SLUG_CONFLICT_MARKERS.some((marker) =>
    bodyText.includes(marker)
  );
}

async function forwardAuthSetCookies(setCookies: readonly string[]) {
  if (setCookies.length === 0) {
    return;
  }

  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("set-cookie", [...setCookies]);
}

async function readCreatedOrganization(
  response: Response
): Promise<OrganizationSummary> {
  try {
    return decodeOrganizationSummary((await response.json()) as unknown);
  } catch {
    throw new Error("Organization creation returned an invalid payload.");
  }
}

async function throwCreateOrganizationError(
  response: Response
): Promise<never> {
  const failureMessage = getCreateOrganizationFailureMessage(
    await readResponseJson(response),
    `Organization creation failed with status ${response.status}.`
  );

  throw new Error(failureMessage);
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

function readSetCookieHeaders(headers: Headers): string[] {
  const headersWithSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = headersWithSetCookie.getSetCookie?.();

  if (setCookies && setCookies.length > 0) {
    return setCookies;
  }

  const setCookie = headers.get("set-cookie");
  return setCookie ? [setCookie] : [];
}

function decodeOrganizationAccessSession(
  session: unknown
): OrganizationAccessSession {
  try {
    return decodeServerAuthSession(session);
  } catch {
    throw new Error("Session lookup returned an invalid payload.");
  }
}
