import { createMiddleware } from "@tanstack/react-start";

export const requestAppContextMiddleware = createMiddleware().server(
  async ({ next, pathname, request }) => {
    if (!shouldHydrateAuthContext(pathname)) {
      return await next();
    }

    const hydrateOrganizationContext =
      shouldHydrateOrganizationContext(pathname);
    const { buildAppAuthContextSnapshotForRequest } =
      await import("./auth-request-context.server");
    const snapshot = await buildAppAuthContextSnapshotForRequest(request, {
      hydrateOrganizationContext,
    });
    const shouldIncludeOrganizationContext =
      hydrateOrganizationContext && snapshot.activeOrganizationId;

    if (shouldIncludeOrganizationContext && snapshot.organizations) {
      return await next({
        context: {
          authSession: snapshot.session,
          currentOrganizationRole: snapshot.currentOrganizationRole,
          organizations: snapshot.organizations,
        },
      });
    }

    return await next({
      context: {
        authSession: snapshot.session,
      },
    });
  }
);

export function shouldHydrateAuthContext(pathname: string) {
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

export function shouldHydrateOrganizationContext(pathname: string) {
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
