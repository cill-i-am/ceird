import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start";

import {
  shouldHydrateAuthContext,
  shouldHydrateOrganizationContext,
} from "./app-context-route-selection";

export {
  shouldHydrateAuthContext,
  shouldHydrateOrganizationContext,
} from "./app-context-route-selection";

export const requestAppContextMiddleware = createMiddleware().server(
  async ({ next, pathname, request }) => {
    const context = await loadRequestAppContextMiddlewareContext({
      pathname,
      request,
    });

    if (context === undefined) {
      return await next();
    }

    return await next({ context });
  }
);

export const loadRequestAppContextMiddlewareContext = createServerOnlyFn(
  async ({
    pathname,
    request,
  }: {
    readonly pathname: string;
    readonly request: Request;
  }) => {
    if (!shouldHydrateAuthContext(pathname)) {
      return;
    }

    const hydrateOrganizationContext =
      shouldHydrateOrganizationContext(pathname);
    const requestSearch =
      pathname === "/oauth/consent" ? readRequestSearch(request) : undefined;
    const { buildAppAuthContextSnapshotForRequest } =
      await import("./auth-request-context.server");
    const snapshot = await buildAppAuthContextSnapshotForRequest(request, {
      hydrateOrganizationContext,
      resolveActiveOrganizationFromList: hydrateOrganizationContext,
    });
    const shouldIncludeOrganizationContext =
      hydrateOrganizationContext && snapshot.activeOrganizationId !== null;

    if (shouldIncludeOrganizationContext && snapshot.organizations) {
      return {
        ...(snapshot.activeOrganizationId
          ? { activeOrganizationId: snapshot.activeOrganizationId }
          : {}),
        authSession: snapshot.session,
        currentOrganizationRole: snapshot.currentOrganizationRole,
        organizations: snapshot.organizations,
        ...(requestSearch ? { requestSearch } : {}),
        ...(snapshot.requestedOrganizationSlug
          ? { requestedOrganizationSlug: snapshot.requestedOrganizationSlug }
          : {}),
      };
    }

    return {
      ...(snapshot.activeOrganizationId !== null ||
      snapshot.requestedOrganizationSlug
        ? { activeOrganizationId: snapshot.activeOrganizationId }
        : {}),
      authSession: snapshot.session,
      ...(requestSearch ? { requestSearch } : {}),
      ...(snapshot.requestedOrganizationSlug
        ? { requestedOrganizationSlug: snapshot.requestedOrganizationSlug }
        : {}),
    };
  }
);

function readRequestSearch(request: Request) {
  const { search } = new URL(request.url);

  if (search.length > 0) {
    return search;
  }
}

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
