import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { createMiddleware, createStart } from "@tanstack/react-start";

const requestAuthContext = createMiddleware().server(
  async ({ next, pathname, request }) => {
    if (!shouldHydrateAuthContext(pathname)) {
      return await next();
    }

    const { readOptionalServerAuthSessionFromRequest } =
      await import("./features/auth/server-session-impl.server");
    const session = await readOptionalServerAuthSessionFromRequest(request);

    if (!session || !shouldHydrateOrganizationContext(pathname)) {
      return await next({
        context: {
          authSession: session,
        },
      });
    }

    const organizationId = session.session.activeOrganizationId
      ? decodeOrganizationId(session.session.activeOrganizationId)
      : null;

    if (!organizationId) {
      return await next({
        context: {
          authSession: session,
        },
      });
    }

    const { getCurrentServerOrganizationsForRequest } =
      await import("./features/organizations/organization-server-impl.server");
    const [organizations, currentOrganizationRole] = await Promise.all([
      getCurrentServerOrganizationsForRequest(request),
      readCurrentOrganizationRoleForRequest(request, organizationId),
    ]);

    return await next({
      context: {
        authSession: session,
        currentOrganizationRole,
        organizations,
      },
    });
  }
);

export const startInstance = createStart(() => ({
  requestMiddleware: [requestAuthContext],
}));

async function readCurrentOrganizationRoleForRequest(
  request: Request,
  organizationId: OrganizationId
): Promise<OrganizationRole | undefined> {
  let currentOrganizationRole: OrganizationRole | undefined;

  try {
    const { getCurrentServerOrganizationMemberRoleForRequest } =
      await import("./features/organizations/organization-server-impl.server");
    const result = await getCurrentServerOrganizationMemberRoleForRequest(
      request,
      organizationId
    );

    currentOrganizationRole = result.role;
  } catch {
    // Role is an optimization here; route-level guards still enforce access.
  }

  return currentOrganizationRole;
}

function shouldHydrateAuthContext(pathname: string) {
  if (pathname === "/health") {
    return false;
  }

  return (
    pathname === "/" ||
    pathname === "/activity" ||
    pathname === "/create-organization" ||
    pathname === "/forgot-password" ||
    pathname === "/login" ||
    pathname === "/members" ||
    pathname === "/oauth/consent" ||
    pathname === "/organization/settings" ||
    pathname === "/reset-password" ||
    pathname === "/settings" ||
    pathname === "/signup" ||
    pathname === "/sites" ||
    pathname === "/verify-email" ||
    pathname.startsWith("/accept-invitation/") ||
    pathname.startsWith("/jobs") ||
    pathname.startsWith("/sites/")
  );
}

function shouldHydrateOrganizationContext(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/activity" ||
    pathname === "/members" ||
    pathname === "/organization/settings" ||
    pathname === "/sites" ||
    pathname.startsWith("/jobs") ||
    pathname.startsWith("/sites/")
  );
}
