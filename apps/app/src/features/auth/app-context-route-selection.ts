const AUTH_CONTEXT_ROUTES = new Set([
  "/",
  "/activity",
  "/create-organization",
  "/forgot-password",
  "/login",
  "/location-access",
  "/members",
  "/oauth/consent",
  "/organization/security",
  "/organization/settings",
  "/organization/settings/labels",
  "/reset-password",
  "/settings",
  "/signup",
  "/sites",
  "/sites-workspace",
  "/verify-email",
]);

const ORGANIZATION_CONTEXT_ROUTES = new Set([
  "/",
  "/activity",
  "/members",
  "/organization/security",
  "/organization/settings",
  "/organization/settings/labels",
  "/sites",
  "/sites-workspace",
]);

export function shouldHydrateAuthContext(pathname: string) {
  if (pathname === "/health") {
    return false;
  }

  return (
    AUTH_CONTEXT_ROUTES.has(pathname) ||
    pathname.startsWith("/accept-invitation/") ||
    pathname.startsWith("/jobs") ||
    pathname.startsWith("/sites/")
  );
}

export function shouldHydrateOrganizationContext(pathname: string) {
  return (
    ORGANIZATION_CONTEXT_ROUTES.has(pathname) ||
    pathname.startsWith("/jobs") ||
    pathname.startsWith("/sites/")
  );
}

export function shouldBypassAuthenticatedAppShell(pathname: string) {
  return pathname === "/create-organization" || pathname === "/location-access";
}

export function shouldBypassAuthenticatedAppShellForRouteMatches(
  routeMatches: readonly { readonly routeId: string }[] | undefined
) {
  return (
    routeMatches?.some(
      (match) =>
        match.routeId === "/create-organization" ||
        match.routeId === "/location-access"
    ) ?? false
  );
}
