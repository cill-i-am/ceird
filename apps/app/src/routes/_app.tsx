import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { getCachedClientAppContext } from "#/features/auth/app-context-client-cache";
import { readAppServerContext } from "#/features/auth/app-server-context";
import { getLoginNavigationTarget } from "#/features/auth/auth-navigation";
import { AuthenticatedAppLayout } from "#/features/auth/authenticated-app-layout";
import { requireAuthenticatedSession } from "#/features/auth/require-authenticated-session";
import { isServerEnvironment } from "#/features/auth/runtime-environment";

export const Route = createFileRoute("/_app")({
  beforeLoad: loadAuthenticatedAppRoute,
  component: AuthenticatedAppLayout,
});

export async function loadAuthenticatedAppRoute(input?: {
  readonly serverContext?: unknown;
}) {
  const serverContext = readAppServerContext(input?.serverContext);
  const clientAppContext =
    serverContext.authSession === undefined && !isServerEnvironment()
      ? await getCachedClientAppContext()
      : undefined;
  const session =
    serverContext.authSession !== undefined
      ? await requireAuthenticatedServerContextSession(
          serverContext.authSession
        )
      : clientAppContext
        ? requireAuthenticatedClientContextSession(clientAppContext.session)
        : await requireAuthenticatedSession();
  const activeOrganizationId =
    clientAppContext === undefined
      ? decodeActiveOrganizationIdFromSession(session)
      : clientAppContext.activeOrganizationId;
  const currentOrganizationRole =
    serverContext.currentOrganizationRole ??
    clientAppContext?.currentOrganizationRole ??
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

function requireAuthenticatedClientContextSession(
  session: Awaited<ReturnType<typeof requireAuthenticatedSession>> | null
) {
  if (!session) {
    throw redirect(getLoginNavigationTarget());
  }

  return session;
}

function decodeActiveOrganizationIdFromSession(
  session: Awaited<ReturnType<typeof requireAuthenticatedSession>>
) {
  return session.session.activeOrganizationId
    ? decodeOrganizationId(session.session.activeOrganizationId)
    : null;
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
