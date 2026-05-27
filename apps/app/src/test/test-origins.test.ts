import { afterEach, describe, expect, test, vi } from "vitest";

function importTestOrigins() {
  vi.resetModules();

  return import("../../e2e/test-origins");
}

describe("Playwright test origins", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("reads the optional tenant origin from PLAYWRIGHT_TENANT_URL", async () => {
    vi.stubEnv("PLAYWRIGHT_TENANT_URL", " https://tenant.example.com ");
    vi.stubEnv("PLAYWRIGHT_BASE_URL", "https://app.example.com");
    vi.stubEnv("PLAYWRIGHT_API_URL", "https://api.example.com");
    vi.stubEnv("PLAYWRIGHT_AGENT_URL", "https://agent.example.com");

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
    vi.stubEnv("PLAYWRIGHT_BASE_URL", "https://app.example.com");
    vi.stubEnv("PLAYWRIGHT_API_URL", "https://api.example.com");
    vi.stubEnv("PLAYWRIGHT_AGENT_URL", "https://agent.example.com");
    vi.resetModules();

    const { TENANT_ORIGIN } = await import("../../e2e/test-urls");

    expect(TENANT_ORIGIN).toBe("https://tenant.example.com");
  });
});
