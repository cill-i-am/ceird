import { redirect } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";

import { isServerEnvironment } from "../auth/runtime-environment";
import {
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
    throw redirect({ to: "/login" });
  }

  const { activeOrganizationId, activeOrganizationSync } =
    await resolveOrganizationAccessState(session);

  if (!activeOrganizationId) {
    throw redirect({ href: "/create-organization" });
  }

  return {
    activeOrganizationId,
    activeOrganizationSync,
    session: withActiveOrganizationId(session, activeOrganizationId),
  };
}

export async function requireOrganizationAccess() {
  return await ensureActiveOrganizationId();
}

export async function redirectIfOrganizationReady() {
  const session = await getCurrentSession();

  if (!session) {
    throw redirect({ to: "/login" });
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
  const activeOrganizationId = resolveCurrentOrganizationId(
    session.session.activeOrganizationId,
    organizations
  );

  return {
    activeOrganizationId,
    activeOrganizationSync: createActiveOrganizationSync(
      session.session.activeOrganizationId ?? null,
      activeOrganizationId
    ),
    organizations,
  };
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

function resolveCurrentOrganizationId(
  activeOrganizationId: string | null | undefined,
  organizations: readonly OrganizationSummary[]
) {
  if (!activeOrganizationId) {
    return organizations[0]?.id ?? null;
  }

  const activeOrganization = organizations.find(
    (organization) => organization.id === activeOrganizationId
  );

  if (activeOrganization) {
    return activeOrganization.id;
  }

  return organizations[0]?.id ?? null;
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
