import {
  shouldHydrateAuthContext,
  shouldHydrateOrganizationContext,
} from "./app-context-middleware";

describe("app context request middleware route selection", () => {
  it.each([
    "/",
    "/activity",
    "/create-organization",
    "/forgot-password",
    "/login",
    "/members",
    "/oauth/consent",
    "/organization/settings",
    "/reset-password",
    "/settings",
    "/signup",
    "/sites",
    "/verify-email",
    "/accept-invitation/inv_123",
    "/jobs",
    "/jobs/job_123",
    "/sites/site_123",
  ])("hydrates auth context for %s", (pathname) => {
    expect(shouldHydrateAuthContext(pathname)).toBe(true);
  });

  it("does not hydrate auth context for the health route", () => {
    expect(shouldHydrateAuthContext("/health")).toBe(false);
  });

  it.each([
    "/",
    "/activity",
    "/members",
    "/organization/settings",
    "/sites",
    "/jobs",
    "/jobs/job_123",
    "/sites/site_123",
  ])("hydrates organization context for %s", (pathname) => {
    expect(shouldHydrateOrganizationContext(pathname)).toBe(true);
  });

  it.each(["/login", "/signup", "/create-organization", "/forgot-password"])(
    "does not hydrate organization context for %s",
    (pathname) => {
      expect(shouldHydrateOrganizationContext(pathname)).toBe(false);
    }
  );
});
