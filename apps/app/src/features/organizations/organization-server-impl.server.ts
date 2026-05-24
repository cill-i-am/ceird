import {
  createOrganizationSlugFromName,
  decodeOrganizationSummary,
  OrganizationId,
} from "@ceird/identity-core";
import type {
  CreateOrganizationNameInput,
  OrganizationId as OrganizationIdType,
  OrganizationMemberRoleResponse,
  OrganizationSummary,
} from "@ceird/identity-core";
import { Schema } from "effect";

import { readGlobalAppServerContext } from "../auth/app-server-context";
import {
  buildAuthReadHeaders,
  getHeaderFromRequest,
  readOptionalCookieRequiredBaseServerAuthRequest,
  readRequiredServerAuthRequest,
  readServerOrganizationMemberRole,
  readServerOrganizations,
} from "../auth/auth-request-context.server";
import type { ServerAuthRequest } from "../auth/auth-request-context.server";

const NullableString = Schema.NullOr(Schema.String);
const NullableOrganizationId = Schema.NullOr(OrganizationId);
const ORGANIZATION_SLUG_CONFLICT_MARKERS = [
  "ORGANIZATION_ALREADY_EXISTS",
  "ORGANIZATION_SLUG_ALREADY_TAKEN",
  "Organization already exists",
  "Organization slug already taken",
] as const;

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
    const retryResponse = await postCreateOrganization(authRequest, {
      name: input.name,
      slug: `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`,
    });

    if (retryResponse.ok) {
      return await finalizeCreatedOrganization(authRequest, retryResponse);
    }

    throw new Error(
      `Organization creation failed with status ${retryResponse.status}.`
    );
  }

  throw new Error(
    `Organization creation failed with status ${response.status}.`
  );
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
    return cachedSession === null
      ? null
      : decodeOrganizationAccessSession(cachedSession);
  }

  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const authRequest =
    readOptionalCookieRequiredBaseServerAuthRequest(getRequestHeader);

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

export async function getCurrentServerOrganizationsForRequest(
  request: Request
) {
  const authRequest = readRequiredServerAuthRequest(
    getHeaderFromRequest(request)
  );
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

export async function getCurrentServerOrganizationMemberRoleForRequest(
  request: Request,
  organizationId: OrganizationIdType
): Promise<OrganizationMemberRole> {
  return await readServerOrganizationMemberRole(
    readRequiredServerAuthRequest(getHeaderFromRequest(request)),
    organizationId
  );
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
    return Schema.decodeUnknownSync(OrganizationAccessSessionSchema)(session);
  } catch {
    throw new Error("Session lookup returned an invalid payload.");
  }
}
