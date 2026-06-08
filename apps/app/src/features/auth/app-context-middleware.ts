import { createMiddleware } from "@tanstack/react-start";

export {
  shouldBypassAuthenticatedAppShell,
  shouldHydrateAuthContext,
  shouldHydrateOrganizationContext,
} from "./app-context-route-selection";

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
    const { getRequest } = await import("@tanstack/react-start/server");
    const { readRequiredCurrentOrganizationRoleForRequest } =
      await import("./auth-request-context.server");
    const currentOrganizationRole =
      context.currentOrganizationRole ??
      (await readRequiredCurrentOrganizationRoleForRequest(
        getRequest(),
        context.activeOrganizationId
      ));

    if (
      currentOrganizationRole === undefined ||
      !isAdministrativeOrganizationRole(currentOrganizationRole)
    ) {
      throw redirect({ to: "/" });
    }

    return await next({
      context: {
        ...context,
        currentOrganizationRole,
      },
    });
  });
