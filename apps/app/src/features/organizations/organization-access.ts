import { redirect } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";

import { getLoginNavigationTarget } from "../auth/auth-navigation";
import { isServerEnvironment } from "../auth/runtime-environment";
import {
  getCurrentServerOrganizationMemberRole,
  getCurrentServerOrganizationSession,
  getCurrentServerOrganizations,
  listCurrentServerOrganizations,
} from "./organization-server";

export interface OrganizationSummary {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

export interface ActiveOrganizationSync {
  readonly required: boolean;
  readonly targetOrganizationId: string | null;
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
const ORGANIZATION_ADMINISTRATION_ROLES = new Set(["admin", "owner"]);

async function getCurrentSession(): Promise<Session | null> {
  if (isServerEnvironment()) {
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
    return await listCurrentServerOrganizations();
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
    session: withActiveOrganizationId(session, activeOrganizationId),
  };
}

export async function requireOrganizationAccess() {
  return await ensureActiveOrganizationId();
}

export async function requireOrganizationAdministrationAccess() {
  const organizationAccess = await ensureActiveOrganizationId();
  const role = await getActiveOrganizationMemberRole(
    organizationAccess.activeOrganizationId
  );

  if (!ORGANIZATION_ADMINISTRATION_ROLES.has(role.role)) {
    throw redirect({ to: "/" });
  }

  return organizationAccess;
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
  const organizations = await resolveOrganizationListForAccess(
    await listOrganizations()
  );
  const activeOrganization = resolveCurrentOrganization(
    session.session.activeOrganizationId,
    organizations
  );
  const activeOrganizationId = activeOrganization?.id ?? null;

  return {
    activeOrganization,
    activeOrganizationId,
    activeOrganizationSync: createActiveOrganizationSync(
      session.session.activeOrganizationId ?? null,
      activeOrganizationId
    ),
    organizations,
  };
}

async function getActiveOrganizationMemberRole(organizationId: string) {
  if (isServerEnvironment()) {
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

  return result.data satisfies OrganizationMemberRole;
}

async function resolveOrganizationListForAccess(
  organizations: readonly OrganizationSummary[]
): Promise<readonly OrganizationSummary[]> {
  if (!isServerEnvironment() || organizations.length > 0) {
    return organizations;
  }

  const strictOrganizations = await getCurrentServerOrganizations();
  return strictOrganizations.map(toOrganizationSummary);
}

function toOrganizationSummary(
  organization: Pick<RawOrganization, "id" | "name" | "slug">
): OrganizationSummary {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
  };
}

function withActiveOrganizationId(
  session: Session,
  activeOrganizationId: string
) {
  return {
    ...session,
    session: {
      ...session.session,
      activeOrganizationId,
    },
  } satisfies Session;
}

function resolveCurrentOrganization(
  activeOrganizationId: string | null | undefined,
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
  currentOrganizationId: string | null,
  targetOrganizationId: string | null
): ActiveOrganizationSync {
  return {
    required: currentOrganizationId !== targetOrganizationId,
    targetOrganizationId,
  };
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
