import { redirect } from "@tanstack/react-router";
import {
  decodeOrganizationId,
  decodeOrganizationMemberRoleResponse,
  decodeOrganizationSummary,
  isAdministrativeOrganizationRole,
  isExternalOrganizationRole,
  isInternalOrganizationRole,
} from "@task-tracker/identity-core";
import type {
  OrganizationId as OrganizationIdType,
  OrganizationRole,
  OrganizationSummary,
} from "@task-tracker/identity-core";

import { authClient } from "#/lib/auth-client";

import { getLoginNavigationTarget } from "../auth/auth-navigation";
import { isServerEnvironment } from "../auth/runtime-environment";

const importOrganizationServer = () => import("./organization-server");

export type { OrganizationSummary } from "@task-tracker/identity-core";

export interface ActiveOrganizationSync {
  readonly required: boolean;
  readonly targetOrganizationId: OrganizationIdType | null;
}

type Session = NonNullable<
  Awaited<ReturnType<typeof authClient.getSession>>["data"]
>;
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

  const session = await authClient.getSession();

  if (session.error) {
    throw session.error;
  }

  return session.data ?? null;
}

export async function listOrganizations(): Promise<
  readonly OrganizationSummary[]
> {
  if (isServerEnvironment()) {
    const { getCurrentServerOrganizations } = await importOrganizationServer();
    return await getCurrentServerOrganizations();
  }

  const organizations = await authClient.organization.list();

  if (organizations.error) {
    throw organizations.error;
  }

  if (!organizations.data) {
    throw new Error("Organization lookup returned no data.");
  }

  return organizations.data.map(toOrganizationSummary);
}

export async function ensureActiveOrganizationId() {
  const session = await getCurrentSession();

  if (!session) {
    throw redirect(getLoginNavigationTarget());
  }

  const { activeOrganization, activeOrganizationId, activeOrganizationSync } =
    await resolveOrganizationAccessState(session);

  if (!activeOrganizationId) {
    throw redirect({ href: "/create-organization" });
  }

  return {
    activeOrganization,
    activeOrganizationId,
    activeOrganizationSync,
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

  const result = await authClient.organization.getActiveMemberRole({
    query: {
      organizationId,
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (!result.data) {
    throw new Error("Organization member role lookup returned no data.");
  }

  return decodeOrganizationMemberRoleResponse(
    result.data satisfies OrganizationMemberRole
  );
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

export async function synchronizeClientActiveOrganization(
  activeOrganizationSync: ActiveOrganizationSync
) {
  if (!activeOrganizationSync.required) {
    return;
  }

  const result = await authClient.organization.setActive({
    organizationId: activeOrganizationSync.targetOrganizationId,
  });

  if (result.error) {
    throw result.error;
  }
}
