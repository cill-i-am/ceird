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
    pathname === "/organization/security" ||
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
    pathname === "/organization/security" ||
    pathname === "/organization/settings" ||
    pathname === "/sites" ||
    pathname.startsWith("/jobs") ||
    pathname.startsWith("/sites/")
  );
}
