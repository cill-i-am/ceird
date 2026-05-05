import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationRole } from "@ceird/identity-core";
import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedAppLayout } from "#/features/auth/authenticated-app-layout";
import { requireAuthenticatedSession } from "#/features/auth/require-authenticated-session";
import { getCurrentOrganizationMemberRole } from "#/features/organizations/organization-access";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const session = await requireAuthenticatedSession();
    const currentOrganizationRole =
      await resolveCurrentOrganizationRoleOrUndefined(
        session.session.activeOrganizationId
      );

    return { currentOrganizationRole, session };
  },
  component: AuthenticatedAppLayout,
});

async function resolveCurrentOrganizationRoleOrUndefined(
  activeOrganizationId: string | null | undefined
): Promise<OrganizationRole | undefined> {
  if (!activeOrganizationId) {
    return undefined;
  }

  try {
    const role = await getCurrentOrganizationMemberRole(
      decodeOrganizationId(activeOrganizationId)
    );

    return role.role;
  } catch {
    return undefined;
  }
}
