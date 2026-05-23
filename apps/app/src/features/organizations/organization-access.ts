import {
  decodeOrganizationId,
  decodeOrganizationMemberRoleResponse,
  decodeOrganizationSummary,
  isAdministrativeOrganizationRole,
  isExternalOrganizationRole,
  isInternalOrganizationRole,
} from "@ceird/identity-core";
import type {
  OrganizationId as OrganizationIdType,
  OrganizationMemberRoleResponse,
  OrganizationRole,
  OrganizationSummary,
} from "@ceird/identity-core";
import { redirect } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";

import { readGlobalAppServerContext } from "../auth/app-server-context";
import { getLoginNavigationTarget } from "../auth/auth-navigation";
import {
  clearClientAuthSessionCache,
  getCachedClientAuthSession,
} from "../auth/client-session-cache";
import type { ClientAuthSession as Session } from "../auth/client-session-cache";
import { isServerEnvironment } from "../auth/runtime-environment";

const importOrganizationServer = () => import("./organization-server");
const CLIENT_ORGANIZATION_ACCESS_CACHE_TTL_MS = 10_000;

export type { OrganizationSummary } from "@ceird/identity-core";
export interface ActiveOrganizationSync {
  readonly required: boolean;
  readonly targetOrganizationId: OrganizationIdType | null;
}

type RawOrganization = NonNullable<
  Awaited<ReturnType<typeof authClient.organization.list>>["data"]
>[number];
type OrganizationMemberRole = NonNullable<
  Awaited<
    ReturnType<typeof authClient.organization.getActiveMemberRole>
  >["data"]
>;

interface ClientAccessCacheEntry<Value> {
  readonly expiresAt: number;
  readonly promise: Promise<Value>;
}

let clientOrganizationsCache:
  | ClientAccessCacheEntry<readonly OrganizationSummary[]>
  | undefined;
const clientOrganizationRoleCache = new Map<
  OrganizationIdType,
  ClientAccessCacheEntry<OrganizationMemberRoleResponse>
>();

export function clearOrganizationAccessClientCache() {
  clearClientAuthSessionCache();
  clientOrganizationsCache = undefined;
  clientOrganizationRoleCache.clear();
}

async function getCurrentSession(): Promise<Session | null> {
  if (isServerEnvironment()) {
    const { getCurrentServerOrganizationSession } =
      await importOrganizationServer();
    return await getCurrentServerOrganizationSession();
  }

  return await getCachedClientAuthSession();
}

export async function listOrganizations(): Promise<
  readonly OrganizationSummary[]
> {
  const cachedOrganizations = readGlobalAppServerContext().organizations;

  if (cachedOrganizations !== undefined) {
    return cachedOrganizations;
  }

  if (isServerEnvironment()) {
    const { getCurrentServerOrganizations } = await importOrganizationServer();
    return await getCurrentServerOrganizations();
  }

  return await getCachedClientOrganizations();
}

async function getCachedClientOrganizations(): Promise<
  readonly OrganizationSummary[]
> {
  if (isFreshClientCacheEntry(clientOrganizationsCache)) {
    return await clientOrganizationsCache.promise;
  }

  const promise = (async () =>
    readClientOrganizations(await authClient.organization.list()))();

  clientOrganizationsCache = createClientCacheEntry(promise);

  try {
    return await promise;
  } catch (error) {
    if (clientOrganizationsCache?.promise === promise) {
      clientOrganizationsCache = undefined;
    }

    throw error;
  }
}

export async function ensureActiveOrganizationId() {
  const session = await getCurrentSession();

  if (!session) {
    throw redirect(getLoginNavigationTarget());
  }

  return await ensureActiveOrganizationIdForSession(session);
}

export async function ensureActiveOrganizationIdForSession(session: Session) {
  const {
    activeOrganization,
    activeOrganizationId,
    activeOrganizationSync,
    organizations,
  } = await resolveOrganizationAccessState(session);

  if (!activeOrganizationId) {
    throw redirect({ to: "/create-organization" });
  }

  return {
    activeOrganization,
    activeOrganizationId,
    activeOrganizationSync,
    organizations,
    session,
  };
}

export async function requireOrganizationAccess() {
  return await ensureActiveOrganizationId();
}

export async function requireOrganizationAdministrationAccess() {
  const organizationAccess = await ensureActiveOrganizationId();

  if (organizationAccess.activeOrganizationSync.required) {
    return organizationAccess;
  }

  const role = await getCurrentOrganizationMemberRole(
    organizationAccess.activeOrganizationId
  );

  assertOrganizationAdministrationRole(role);

  return organizationAccess;
}

export function assertOrganizationAdministrationRole(input: {
  readonly role: OrganizationRole;
}) {
  if (!isAdministrativeOrganizationRole(input.role)) {
    throw redirect({ to: "/" });
  }
}

export function assertOrganizationAdministrationRouteContext(context: {
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}) {
  if (context.activeOrganizationSync.required) {
    return;
  }

  const role = context.currentOrganizationRole;

  if (role === undefined) {
    throw redirect({ to: "/" });
  }

  assertOrganizationAdministrationRole({ role });
}

export function assertOrganizationInternalRole(input: {
  readonly role: OrganizationRole;
}) {
  if (!isInternalOrganizationRole(input.role)) {
    throw redirect({
      to: isExternalOrganizationRole(input.role) ? "/jobs" : "/",
    });
  }
}

export function assertOrganizationInternalRouteContext(context: {
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}) {
  if (context.activeOrganizationSync.required) {
    return;
  }

  const role = context.currentOrganizationRole;

  if (role === undefined) {
    throw redirect({ to: "/" });
  }

  assertOrganizationInternalRole({ role });
}

export async function redirectIfOrganizationReady() {
  const session = await getCurrentSession();

  if (!session) {
    throw redirect(getLoginNavigationTarget());
  }

  const { activeOrganizationId, activeOrganizationSync, organizations } =
    await resolveOrganizationAccessState(session);

  if (activeOrganizationId) {
    throw redirect({ to: "/" });
  }

  if (organizations.length > 0) {
    throw redirect({ to: "/" });
  }

  return {
    activeOrganizationSync,
  };
}

async function resolveOrganizationAccessState(session: Session) {
  const organizations = await listOrganizations();
  const currentActiveOrganizationId = decodeNullableOrganizationId(
    session.session.activeOrganizationId
  );
  const activeOrganization = resolveCurrentOrganization(
    currentActiveOrganizationId,
    organizations
  );
  const activeOrganizationId = activeOrganization?.id ?? null;

  return {
    activeOrganization,
    activeOrganizationId,
    activeOrganizationSync: createActiveOrganizationSync(
      currentActiveOrganizationId,
      activeOrganizationId
    ),
    organizations,
  };
}

export async function getCurrentOrganizationMemberRole(
  organizationId: OrganizationIdType
) {
  if (isServerEnvironment()) {
    const { getCurrentServerOrganizationMemberRole } =
      await importOrganizationServer();
    return await getCurrentServerOrganizationMemberRole(organizationId);
  }

  return await getCachedClientOrganizationMemberRole(organizationId);
}

async function getCachedClientOrganizationMemberRole(
  organizationId: OrganizationIdType
) {
  const cachedRole = clientOrganizationRoleCache.get(organizationId);

  if (isFreshClientCacheEntry(cachedRole)) {
    return await cachedRole.promise;
  }

  const promise = (async () =>
    readClientOrganizationMemberRole(
      await authClient.organization.getActiveMemberRole({
        query: {
          organizationId,
        },
      })
    ))();

  clientOrganizationRoleCache.set(
    organizationId,
    createClientCacheEntry(promise)
  );

  try {
    return await promise;
  } catch (error) {
    if (clientOrganizationRoleCache.get(organizationId)?.promise === promise) {
      clientOrganizationRoleCache.delete(organizationId);
    }

    throw error;
  }
}

function toOrganizationSummary(
  organization: Pick<RawOrganization, "id" | "name" | "slug">
): OrganizationSummary {
  return decodeOrganizationSummary({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
  });
}

function resolveCurrentOrganization(
  activeOrganizationId: OrganizationIdType | null,
  organizations: readonly OrganizationSummary[]
) {
  if (!activeOrganizationId) {
    return organizations[0] ?? null;
  }

  const activeOrganization = organizations.find(
    (organization) => organization.id === activeOrganizationId
  );

  if (activeOrganization) {
    return activeOrganization;
  }

  return organizations[0] ?? null;
}

function createActiveOrganizationSync(
  currentOrganizationId: OrganizationIdType | null,
  targetOrganizationId: OrganizationIdType | null
): ActiveOrganizationSync {
  return {
    required: currentOrganizationId !== targetOrganizationId,
    targetOrganizationId,
  };
}

function decodeNullableOrganizationId(
  organizationId: string | null | undefined
): OrganizationIdType | null {
  return organizationId ? decodeOrganizationId(organizationId) : null;
}

export async function setActiveOrganization(
  organizationId: OrganizationIdType | null
) {
  const result = await authClient.organization.setActive({
    organizationId,
  });

  if (result.error) {
    throw result.error;
  }

  clearOrganizationAccessClientCache();
}

export async function synchronizeClientActiveOrganization(
  activeOrganizationSync: ActiveOrganizationSync
) {
  if (!activeOrganizationSync.required) {
    return;
  }

  await setActiveOrganization(activeOrganizationSync.targetOrganizationId);
}

function createClientCacheEntry<Value>(
  promise: Promise<Value>
): ClientAccessCacheEntry<Value> {
  return {
    expiresAt: Date.now() + CLIENT_ORGANIZATION_ACCESS_CACHE_TTL_MS,
    promise,
  };
}

function isFreshClientCacheEntry<Value>(
  entry: ClientAccessCacheEntry<Value> | undefined
): entry is ClientAccessCacheEntry<Value> {
  return entry !== undefined && entry.expiresAt > Date.now();
}

function readClientOrganizations(
  input: Awaited<ReturnType<typeof authClient.organization.list>>
) {
  if (input.error) {
    throw input.error;
  }

  if (!input.data) {
    throw new Error("Organization lookup returned no data.");
  }

  return input.data.map(toOrganizationSummary);
}

function readClientOrganizationMemberRole(
  input: Awaited<ReturnType<typeof authClient.organization.getActiveMemberRole>>
) {
  if (input.error) {
    throw input.error;
  }

  if (!input.data) {
    throw new Error("Organization member role lookup returned no data.");
  }

  return decodeOrganizationMemberRoleResponse(
    input.data satisfies OrganizationMemberRole
  );
}
