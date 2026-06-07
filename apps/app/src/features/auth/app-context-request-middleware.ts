import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start";

import {
  shouldHydrateAuthContext,
  shouldHydrateOrganizationContext,
} from "./app-context-route-selection";

const buildRequestAuthContextSnapshot = createServerOnlyFn(
  async ({
    hydrateOrganizationContext,
    request,
  }: {
    readonly hydrateOrganizationContext: boolean;
    readonly request: Request;
  }) => {
    const { buildAppAuthContextSnapshotForRequest } =
      await import("./auth-request-context.server");

    return await buildAppAuthContextSnapshotForRequest(request, {
      hydrateOrganizationContext,
      resolveActiveOrganizationFromList: hydrateOrganizationContext,
    });
  }
);

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

export async function loadRequestAppContextMiddlewareContext({
  pathname,
  request,
}: {
  readonly pathname: string;
  readonly request: Request;
}) {
  if (!shouldHydrateAuthContext(pathname)) {
    return;
  }

  const hydrateOrganizationContext = shouldHydrateOrganizationContext(pathname);
  const requestSearch =
    pathname === "/oauth/consent" ? readRequestSearch(request) : undefined;
  const snapshot = await buildRequestAuthContextSnapshot({
    hydrateOrganizationContext,
    request,
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

function readRequestSearch(request: Request) {
  const { search } = new URL(request.url);

  if (search.length > 0) {
    return search;
  }
}
