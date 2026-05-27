import { afterEach, describe, expect, test, vi } from "vitest";

function importTestOrigins() {
  vi.resetModules();

  return import("../../e2e/test-origins");
}

function stubRequiredPlaywrightOrigins() {
  vi.stubEnv("PLAYWRIGHT_BASE_URL", "https://app.example.com");
  vi.stubEnv("PLAYWRIGHT_API_URL", "https://api.example.com");
  vi.stubEnv("PLAYWRIGHT_AGENT_URL", "https://agent.example.com");
}

describe("Playwright test origins", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("reads the optional tenant origin from PLAYWRIGHT_TENANT_URL", async () => {
    vi.stubEnv("PLAYWRIGHT_TENANT_URL", " https://tenant.example.com ");
    stubRequiredPlaywrightOrigins();

    const { TENANT_ORIGIN } = await importTestOrigins();

    expect(TENANT_ORIGIN).toBe("https://tenant.example.com");
  });

  test("leaves the tenant origin unset in package-local mode", async () => {
    vi.stubEnv("PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER", "1");

    const { TENANT_ORIGIN } = await importTestOrigins();

    expect(TENANT_ORIGIN).toBeUndefined();
  });

  test("re-exports the tenant origin from the shared test URLs module", async () => {
    vi.stubEnv("PLAYWRIGHT_TENANT_URL", "https://tenant.example.com");
    stubRequiredPlaywrightOrigins();
    vi.resetModules();

    const { TENANT_ORIGIN } = await import("../../e2e/test-urls");

    expect(TENANT_ORIGIN).toBe("https://tenant.example.com");
  });

  test.each([
    [
      "https://preview-tenant-health--pr-123.ceird.app",
      "preview-tenant-health",
    ],
    [
      "https://staging-tenant-health--staging.ceird.app",
      "staging-tenant-health",
    ],
    ["https://acme-field-ops.ceird.app", "acme-field-ops"],
  ])(
    "derives the organization slug from tenant origin %s",
    async (tenantOrigin, expectedSlug) => {
      stubRequiredPlaywrightOrigins();
      const { deriveTenantOrganizationSlug } = await importTestOrigins();

      expect(deriveTenantOrganizationSlug(tenantOrigin)).toBe(expectedSlug);
    }
  );

  test.each([
    "not-a-url",
    "mailto:preview-tenant-health--pr-123.ceird.app",
    "https://--staging.ceird.app",
    "https://Preview_Tenant_Health--staging.ceird.app",
  ])(
    "rejects tenant origin %s when no valid slug can be derived",
    async (tenantOrigin) => {
      stubRequiredPlaywrightOrigins();
      const { deriveTenantOrganizationSlug } = await importTestOrigins();

      expect(() => deriveTenantOrganizationSlug(tenantOrigin)).toThrow(
        /PLAYWRIGHT_TENANT_URL/
      );
    }
  );
});
