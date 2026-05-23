import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { createFileRoute } from "@tanstack/react-router";

import { readAppServerContext } from "#/features/auth/app-server-context";
import { AuthenticatedAppLayout } from "#/features/auth/authenticated-app-layout";
import { requireAuthenticatedSession } from "#/features/auth/require-authenticated-session";

export const Route = createFileRoute("/_app")({
  beforeLoad: loadAuthenticatedAppRoute,
  component: AuthenticatedAppLayout,
});

export async function loadAuthenticatedAppRoute(input?: {
  readonly serverContext?: unknown;
}) {
  const serverContext = readAppServerContext(input?.serverContext);
  const session =
    serverContext.authSession === undefined
      ? await requireAuthenticatedSession()
      : await requireAuthenticatedServerContextSession(
          serverContext.authSession
        );
  const activeOrganizationId = session.session.activeOrganizationId
    ? decodeOrganizationId(session.session.activeOrganizationId)
    : null;
  const currentOrganizationRole =
    serverContext.currentOrganizationRole ??
    (await resolveCurrentOrganizationRoleOrUndefined(activeOrganizationId));

  return { activeOrganizationId, currentOrganizationRole, session };
}

async function requireAuthenticatedServerContextSession(
  session: Awaited<ReturnType<typeof requireAuthenticatedSession>> | null
) {
  if (!session) {
    return await requireAuthenticatedSession();
  }

  return session;
}

async function resolveCurrentOrganizationRoleOrUndefined(
  activeOrganizationId: OrganizationId | null
): Promise<OrganizationRole | undefined> {
  if (!activeOrganizationId) {
    return undefined;
  }

  try {
    const { getCurrentOrganizationMemberRole } =
      await import("#/features/organizations/organization-access");
    const role = await getCurrentOrganizationMemberRole(activeOrganizationId);

    return role.role;
  } catch {
    return undefined;
  }
}
