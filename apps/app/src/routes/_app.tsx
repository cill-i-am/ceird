import { decodeOrganizationId } from "@ceird/identity-core";
import type {
  OrganizationId,
  OrganizationRole,
  OrganizationSummary,
} from "@ceird/identity-core";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { getCachedClientAppContext } from "#/features/auth/app-context-client-cache";
import { shouldHydrateOrganizationContext } from "#/features/auth/app-context-route-selection";
import { readAppServerContext } from "#/features/auth/app-server-context";
import { getLoginNavigationTarget } from "#/features/auth/auth-navigation";
import { AuthenticatedAppLayout } from "#/features/auth/authenticated-app-layout";
import { requireAuthenticatedSession } from "#/features/auth/require-authenticated-session";
import { isServerEnvironment } from "#/features/auth/runtime-environment";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context, location, serverContext }) =>
    loadAuthenticatedAppRoute({
      context,
      pathname: location.pathname,
      serverContext,
    }),
  component: AuthenticatedAppLayout,
});

export async function loadAuthenticatedAppRoute(input?: {
  readonly context?: unknown;
  readonly pathname?: string | undefined;
  readonly serverContext?: unknown;
}) {
  const serverContext = readAppServerContext(
    input?.context ?? input?.serverContext
  );
  const hydrateOrganizationContext =
    input?.pathname !== undefined &&
    shouldHydrateOrganizationContext(input.pathname);
  const clientAppContext =
    serverContext.authSession === undefined && !isServerEnvironment()
      ? await getCachedClientAppContext({ hydrateOrganizationContext })
      : undefined;
  const session = await getAuthenticatedRouteSession({
    clientAppContext,
    serverContextSession: serverContext.authSession,
  });
  const activeOrganizationId =
    clientAppContext === undefined
      ? resolveServerContextActiveOrganizationId(serverContext, session)
      : clientAppContext.activeOrganizationId;
  const canUseActiveOrganizationRole = activeOrganizationIdMatchesSession(
    activeOrganizationId,
    session
  );
  const currentOrganizationRole = canUseActiveOrganizationRole
    ? (serverContext.currentOrganizationRole ??
      clientAppContext?.currentOrganizationRole ??
      (await resolveCurrentOrganizationRoleOrUndefined(activeOrganizationId)))
    : undefined;
  const organizations = resolveOrganizations({
    clientAppContext,
    serverContextOrganizations: serverContext.organizations,
  });

  return {
    activeOrganizationId,
    currentOrganizationRole,
    ...(organizations ? { organizations } : {}),
    ...(serverContext.requestedOrganizationSlug
      ? { requestedOrganizationSlug: serverContext.requestedOrganizationSlug }
      : {}),
    session,
  };
}

async function getAuthenticatedRouteSession({
  clientAppContext,
  serverContextSession,
}: {
  readonly clientAppContext:
    | Awaited<ReturnType<typeof getCachedClientAppContext>>
    | undefined;
  readonly serverContextSession:
    | Awaited<ReturnType<typeof requireAuthenticatedSession>>
    | null
    | undefined;
}) {
  if (serverContextSession !== undefined) {
    return await requireAuthenticatedServerContextSession(serverContextSession);
  }

  if (clientAppContext) {
    return requireAuthenticatedClientContextSession(clientAppContext.session);
  }

  return await requireAuthenticatedSession();
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

function resolveServerContextActiveOrganizationId(
  serverContext: ReturnType<typeof readAppServerContext>,
  session: Awaited<ReturnType<typeof requireAuthenticatedSession>>
) {
  return serverContext.activeOrganizationId === undefined
    ? decodeActiveOrganizationIdFromSession(session)
    : (serverContext.activeOrganizationId ?? null);
}

function activeOrganizationIdMatchesSession(
  activeOrganizationId: OrganizationId | null,
  session: Awaited<ReturnType<typeof requireAuthenticatedSession>>
) {
  return (
    activeOrganizationId === decodeActiveOrganizationIdFromSession(session)
  );
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

function resolveOrganizations(input: {
  readonly clientAppContext:
    | Awaited<ReturnType<typeof getCachedClientAppContext>>
    | undefined;
  readonly serverContextOrganizations:
    | readonly OrganizationSummary[]
    | undefined;
}) {
  return (
    input.serverContextOrganizations ?? input.clientAppContext?.organizations
  );
}
