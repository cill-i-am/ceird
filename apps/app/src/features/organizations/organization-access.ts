import {
  decodeOrganizationId,
  decodeOrganizationMemberRoleResponse,
  decodeOrganizationSummary,
} from "@ceird/identity-core";
import type {
  OrganizationId as OrganizationIdType,
  OrganizationSlug,
  OrganizationSummary,
} from "@ceird/identity-core";
import { redirect } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";

import {
  getCachedClientAppContext,
  readFreshCachedClientAppContext,
} from "../auth/app-context-client-cache";
import { readGlobalAppServerContext } from "../auth/app-server-context";
import { getLoginNavigationTarget } from "../auth/auth-navigation";
import { isServerEnvironment } from "../auth/runtime-environment";
import type { ServerAuthSession as Session } from "../auth/server-session-types";
import {
  clearClientOrganizationRoleCacheForPromise,
  clearClientOrganizationsCacheForPromise,
  clearOrganizationAccessClientCache,
  readFreshClientOrganizationRoleCache,
  readFreshClientOrganizationsCache,
  setClientOrganizationRoleCache,
  setClientOrganizationsCache,
} from "./organization-access-cache";
import { assertOrganizationAdministrationRole } from "./organization-route-access";
import type { ActiveOrganizationSync } from "./organization-route-access";

const importOrganizationServer = () => import("./organization-server");

export { clearOrganizationAccessClientCache } from "./organization-access-cache";
export {
  assertOrganizationAdministrationRole,
  assertOrganizationAdministrationRouteContext,
  assertOrganizationInternalRole,
  assertOrganizationInternalRouteContext,
} from "./organization-route-access";
export type { ActiveOrganizationSync } from "./organization-route-access";
export type { OrganizationSummary } from "@ceird/identity-core";

type RawOrganization = NonNullable<
  Awaited<ReturnType<typeof authClient.organization.list>>["data"]
>[number];
type OrganizationMemberRole = NonNullable<
  Awaited<
    ReturnType<typeof authClient.organization.getActiveMemberRole>
  >["data"]
>;

async function getCurrentSession(): Promise<Session | null> {
  if (isServerEnvironment()) {
    const { getCurrentServerOrganizationSession } =
      await importOrganizationServer();
    return await getCurrentServerOrganizationSession();
  }

  const appContext = await getCachedClientAppContext();

  return appContext.session;
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

  const clientAppContext = await readFreshCachedClientAppContext();

  if (clientAppContext?.organizations !== undefined) {
    return clientAppContext.organizations;
  }

  return await getCachedClientOrganizations();
}

async function getCachedClientOrganizations(): Promise<
  readonly OrganizationSummary[]
> {
  const cachedOrganizations = readFreshClientOrganizationsCache();

  if (cachedOrganizations) {
    return await cachedOrganizations;
  }

  const promise = listBetterAuthClientOrganizations();

  setClientOrganizationsCache(promise);

  try {
    return await promise;
  } catch (error) {
    clearClientOrganizationsCacheForPromise(promise);
    throw error;
  }
}

function listBetterAuthClientOrganizations(): Promise<
  readonly OrganizationSummary[]
> {
  return (async () =>
    readClientOrganizations(await authClient.organization.list()))();
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

  if (!activeOrganizationId || !activeOrganization) {
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

export async function redirectIfOrganizationReady() {
  const session = await getCurrentSession();

  if (!session) {
    throw redirect(getLoginNavigationTarget());
  }

  const {
    activeOrganizationId,
    activeOrganizationSync,
    organizations,
    routeResolvedNoAccessibleRequestedOrganization,
  } = await resolveOrganizationAccessState(session);

  if (activeOrganizationId) {
    throw redirect({ to: "/" });
  }

  if (
    organizations.length > 0 &&
    !routeResolvedNoAccessibleRequestedOrganization
  ) {
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
  const routeResolvedActiveOrganization =
    await readRouteResolvedActiveOrganizationId();
  const requestedActiveOrganizationId =
    routeResolvedActiveOrganization.kind === "resolved"
      ? routeResolvedActiveOrganization.activeOrganizationId
      : currentActiveOrganizationId;
  const activeOrganization =
    routeResolvedActiveOrganization.kind === "resolved" &&
    requestedActiveOrganizationId === null
      ? null
      : resolveCurrentOrganization(
          requestedActiveOrganizationId,
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
    routeResolvedNoAccessibleRequestedOrganization:
      routeResolvedActiveOrganization.kind === "resolved" &&
      routeResolvedActiveOrganization.activeOrganizationId === null &&
      routeResolvedActiveOrganization.requestedOrganizationSlug !== undefined,
  };
}

type RouteResolvedActiveOrganization =
  | {
      readonly activeOrganizationId: OrganizationIdType | null;
      readonly kind: "resolved";
      readonly requestedOrganizationSlug: OrganizationSlug | undefined;
    }
  | { readonly kind: "none" };

async function readRouteResolvedActiveOrganizationId(): Promise<RouteResolvedActiveOrganization> {
  const serverContext = readGlobalAppServerContext();

  if (
    serverContext.activeOrganizationId !== undefined &&
    (serverContext.activeOrganizationId !== null ||
      serverContext.requestedOrganizationSlug !== undefined)
  ) {
    return {
      activeOrganizationId: serverContext.activeOrganizationId ?? null,
      kind: "resolved",
      requestedOrganizationSlug: serverContext.requestedOrganizationSlug,
    };
  }

  if (isServerEnvironment()) {
    return { kind: "none" };
  }

  const clientAppContext = await readFreshCachedClientAppContext();

  if (
    clientAppContext &&
    (clientAppContext.activeOrganizationId !== null ||
      clientAppContext.requestedOrganizationSlug !== undefined)
  ) {
    return {
      activeOrganizationId: clientAppContext.activeOrganizationId,
      kind: "resolved",
      requestedOrganizationSlug: clientAppContext.requestedOrganizationSlug,
    };
  }

  return { kind: "none" };
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
  const cachedRole = readFreshClientOrganizationRoleCache(organizationId);

  if (cachedRole) {
    return await cachedRole;
  }

  const promise = (async () =>
    readClientOrganizationMemberRole(
      await authClient.organization.getActiveMemberRole({
        query: {
          organizationId,
        },
      })
    ))();

  setClientOrganizationRoleCache(organizationId, promise);

  try {
    return await promise;
  } catch (error) {
    clearClientOrganizationRoleCacheForPromise(organizationId, promise);
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
