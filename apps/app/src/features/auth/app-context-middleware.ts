import type { AdministrativeOrganizationRole } from "@ceird/identity-core";
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
      hydrateOrganizationContext && snapshot.activeOrganizationId !== null;

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

export const optionalAuthFunctionMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { buildAppAuthContextSnapshotForRequest } =
    await import("./auth-request-context.server");
  const snapshot = await buildAppAuthContextSnapshotForRequest(getRequest());

  return await next({
    context: snapshot,
  });
});

export const requiredAuthFunctionMiddleware = createMiddleware({
  type: "function",
})
  .middleware([optionalAuthFunctionMiddleware])
  .server(async ({ context, next }) => {
    if (!context.session) {
      const { redirect } = await import("@tanstack/react-router");
      const { getLoginNavigationTarget } = await import("./auth-navigation");

      throw redirect(getLoginNavigationTarget());
    }

    return await next({
      context: {
        ...context,
        session: context.session,
      },
    });
  });

export const organizationFunctionMiddleware = createMiddleware({
  type: "function",
})
  .middleware([requiredAuthFunctionMiddleware])
  .server(async ({ context, next }) => {
    const { redirect } = await import("@tanstack/react-router");
    const { getRequest } = await import("@tanstack/react-start/server");
    const { buildAppAuthContextSnapshotForRequest } =
      await import("./auth-request-context.server");

    const snapshot = await buildAppAuthContextSnapshotForRequest(getRequest(), {
      hydrateOrganizationContext: true,
      resolveActiveOrganizationFromList: true,
      session: context.session,
    });

    if (!snapshot.activeOrganizationId) {
      throw redirect({ to: "/create-organization" });
    }

    return await next({
      context: {
        ...context,
        ...snapshot,
        activeOrganizationId: snapshot.activeOrganizationId,
        session: context.session,
      },
    });
  });

export const organizationAdminFunctionMiddleware = createMiddleware({
  type: "function",
})
  .middleware([organizationFunctionMiddleware])
  .server(async ({ context, next }) => {
    const { redirect } = await import("@tanstack/react-router");
    const { isAdministrativeOrganizationRole } =
      await import("@ceird/identity-core");
    const currentOrganizationRole = context.currentOrganizationRole;

    if (
      currentOrganizationRole === undefined ||
      !isAdministrativeOrganizationRole(currentOrganizationRole)
    ) {
      throw redirect({ to: "/" });
    }
    const administrativeOrganizationRole =
      currentOrganizationRole as AdministrativeOrganizationRole;

    return await next({
      context: {
        ...context,
        currentOrganizationRole: administrativeOrganizationRole,
      },
    });
  });

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
