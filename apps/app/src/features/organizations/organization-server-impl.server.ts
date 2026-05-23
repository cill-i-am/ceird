import {
  createOrganizationSlugFromName,
  decodeOrganizationMemberRoleResponse,
  decodeOrganizationSummary,
  decodeOrganizationSummaryList,
  OrganizationId,
} from "@ceird/identity-core";
import type {
  CreateOrganizationNameInput,
  OrganizationId as OrganizationIdType,
  OrganizationMemberRoleResponse,
  OrganizationSummary,
} from "@ceird/identity-core";
import { Schema } from "effect";

import { resolveConfiguredServerAuthBaseURL } from "#/lib/auth-client.server";
import {
  normalizeServerApiCookieHeader,
  readServerApiForwardedHeaders,
} from "#/lib/server-api-forwarded-headers";

import { readGlobalAppServerContext } from "../auth/app-server-context";

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

interface ServerAuthRequest {
  cookie: string;
  authBaseURL: string;
  forwardedHeaders?: ReturnType<typeof readServerApiForwardedHeaders>;
}

type RequestHeaderReader = (name: string) => string | undefined;

export async function createCurrentServerOrganizationDirect(
  input: CreateOrganizationNameInput
): Promise<OrganizationSummary> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const authRequest = readServerAuthRequestStrict(getRequestHeader);
  const baseSlug = createOrganizationSlugFromName(input.name);
  const response = await postCreateOrganization(authRequest, {
    name: input.name,
    slug: baseSlug,
  });

  if (response.ok) {
    await forwardAuthResponseCookies(response);
    return await readCreatedOrganization(response);
  }

  if (await isOrganizationSlugConflictResponse(response)) {
    const retryResponse = await postCreateOrganization(authRequest, {
      name: input.name,
      slug: `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`,
    });

    if (retryResponse.ok) {
      await forwardAuthResponseCookies(retryResponse);
      return await readCreatedOrganization(retryResponse);
    }

    throw new Error(
      `Organization creation failed with status ${retryResponse.status}.`
    );
  }

  throw new Error(
    `Organization creation failed with status ${response.status}.`
  );
}

export async function getCurrentServerOrganizationSessionDirect(): Promise<OrganizationAccessSession | null> {
  const cachedSession = readGlobalAppServerContext().authSession;

  if (cachedSession !== undefined) {
    return cachedSession === null
      ? null
      : decodeOrganizationAccessSession(cachedSession);
  }

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

export async function getCurrentServerOrganizationsDirect() {
  const cachedOrganizations = readGlobalAppServerContext().organizations;

  if (cachedOrganizations !== undefined) {
    return cachedOrganizations;
  }

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
}

export async function getCurrentServerOrganizationsForRequest(
  request: Request
) {
  const authRequest = readServerAuthRequestStrict(
    getHeaderFromRequest(request)
  );
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
  const authRequest = readServerAuthRequestStrict(getRequestHeader);
  return await getCurrentServerOrganizationMemberRoleForAuthRequest(
    authRequest,
    organizationId
  );
}

export async function getCurrentServerOrganizationMemberRoleForRequest(
  request: Request,
  organizationId: OrganizationIdType
): Promise<OrganizationMemberRole> {
  return await getCurrentServerOrganizationMemberRoleForAuthRequest(
    readServerAuthRequestStrict(getHeaderFromRequest(request)),
    organizationId
  );
}

async function getCurrentServerOrganizationMemberRoleForAuthRequest(
  authRequest: ServerAuthRequest,
  organizationId: OrganizationIdType
): Promise<OrganizationMemberRole> {
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

export async function setCurrentServerActiveOrganizationDirect(
  organizationId: OrganizationIdType
): Promise<void> {
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

function readServerSessionRequest(
  getRequestHeader: RequestHeaderReader
): ServerAuthRequest | null {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    return null;
  }

  const authBaseURL = readServerAuthBaseURL();
  const forwardedHeaders = readServerApiForwardedHeaders({
    forwardedHost: getRequestHeader("x-forwarded-host"),
    host: getRequestHeader("host"),
    origin: getRequestHeader("origin"),
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
  getRequestHeader: RequestHeaderReader
): ServerAuthRequest {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    throw new Error(
      "Cannot list organizations without the current auth cookie."
    );
  }

  const authBaseURL = readServerAuthBaseURL();
  const forwardedHeaders = readServerApiForwardedHeaders({
    forwardedHost: getRequestHeader("x-forwarded-host"),
    host: getRequestHeader("host"),
    origin: getRequestHeader("origin"),
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

function getHeaderFromRequest(request: Request): RequestHeaderReader {
  return (name) => request.headers.get(name) ?? undefined;
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

async function forwardAuthResponseCookies(response: Response) {
  const setCookies = readSetCookieHeaders(response.headers);

  if (setCookies.length === 0) {
    return;
  }

  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("set-cookie", setCookies);
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

function decodeOrganizationSummariesStrict(
  organizations: unknown
): readonly OrganizationSummary[] {
  try {
    return decodeOrganizationSummaryList(organizations);
  } catch {
    throw new Error("Organization lookup returned an invalid payload.");
  }
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

function decodeOrganizationMemberRole(role: unknown): OrganizationMemberRole {
  try {
    return decodeOrganizationMemberRoleResponse(role);
  } catch {
    throw new Error(
      "Organization member role lookup returned an invalid payload."
    );
  }
}
