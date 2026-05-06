import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedAppLayout } from "#/features/auth/authenticated-app-layout";
import { requireAuthenticatedSession } from "#/features/auth/require-authenticated-session";
import { getCurrentOrganizationMemberRole } from "#/features/organizations/organization-access";

export const Route = createFileRoute("/_app")({
  beforeLoad: loadAuthenticatedAppRoute,
  component: AuthenticatedAppLayout,
});

export async function loadAuthenticatedAppRoute() {
  const session = await requireAuthenticatedSession();
  const activeOrganizationId = session.session.activeOrganizationId
    ? decodeOrganizationId(session.session.activeOrganizationId)
    : null;
  const currentOrganizationRole =
    await resolveCurrentOrganizationRoleOrUndefined(activeOrganizationId);

  return { activeOrganizationId, currentOrganizationRole, session };
}

async function resolveCurrentOrganizationRoleOrUndefined(
  activeOrganizationId: OrganizationId | null
): Promise<OrganizationRole | undefined> {
  if (!activeOrganizationId) {
    return undefined;
  }

  try {
    const role = await getCurrentOrganizationMemberRole(activeOrganizationId);

    return role.role;
  } catch {
    return undefined;
  }
}
