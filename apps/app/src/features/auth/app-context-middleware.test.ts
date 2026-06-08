import { decodeOrganizationId } from "@ceird/identity-core";

import {
  optionalAuthFunctionMiddleware,
  organizationAdminFunctionMiddleware,
  organizationFunctionMiddleware,
  requiredAuthFunctionMiddleware,
  shouldBypassAuthenticatedAppShell,
  shouldHydrateAuthContext,
  shouldHydrateOrganizationContext,
} from "./app-context-middleware";
import { loadRequestAppContextMiddlewareContext } from "./app-context-request-middleware";
import { decodeServerAuthSession } from "./app-context-types";
import type { ServerAuthSession } from "./app-context-types";
import { buildAppAuthContextSnapshotForRequest } from "./auth-request-context.server";

const betterAuthSessionWithActiveOrganization = {
  session: {
    id: "session_123",
    createdAt: "2026-04-04T17:08:12.497Z",
    updatedAt: "2026-04-04T17:08:12.497Z",
    userId: "user_123",
    expiresAt: "2026-04-11T17:08:12.497Z",
    token: "session-token",
    ipAddress: "",
    userAgent: "curl/8.7.1",
    activeOrganizationId: "org_123",
  },
  user: {
    id: "user_123",
    name: "Taylor Example",
    email: "taylor@example.com",
    image: null,
    emailVerified: false,
    twoFactorEnabled: false,
    createdAt: "2026-04-04T17:08:12.488Z",
    updatedAt: "2026-04-04T17:08:12.488Z",
  },
};
const authSessionWithActiveOrganization: ServerAuthSession =
  decodeServerAuthSession(betterAuthSessionWithActiveOrganization);

function buildAuthRequest() {
  return new Request("https://app.example.com/", {
    headers: {
      cookie: "better-auth.session_token=session-token",
    },
  });
}

function createDeferredResponse() {
  return (
    Promise as unknown as {
      withResolvers<Value>(): {
        promise: Promise<Value>;
        resolve: (value: Value | PromiseLike<Value>) => void;
      };
    }
  ).withResolvers<Response>();
}

function createBetterAuthSessionPayload(session: ServerAuthSession) {
  return {
    ...session,
    session: {
      ...session.session,
      token: "session-token",
    },
  };
}

function clearTenantHostEnv() {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete process.env.VITE_TENANT_BASE_DOMAIN;
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete process.env.VITE_TENANT_HOST_MODE;
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete process.env.VITE_TENANT_RESERVED_HOSTNAMES;
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete process.env.VITE_TENANT_STAGE_ALIAS;
}

describe("app/auth server function middleware exports", () => {
  it("exports app/auth server function middleware", () => {
    expect(optionalAuthFunctionMiddleware).toBeDefined();
    expect(requiredAuthFunctionMiddleware).toBeDefined();
    expect(organizationFunctionMiddleware).toBeDefined();
    expect(organizationAdminFunctionMiddleware).toBeDefined();
  });
});

describe("app context request middleware route selection", () => {
  it.each([
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
    expect(shouldHydrateAuthContext(pathname)).toBeTruthy();
  });

  it("does not hydrate auth context for the health route", () => {
    expect(shouldHydrateAuthContext("/health")).toBeFalsy();
  });

  it.each([
    "/",
    "/activity",
    "/members",
    "/organization/security",
    "/organization/settings",
    "/sites",
    "/jobs",
    "/jobs/job_123",
    "/sites/site_123",
  ])("hydrates organization context for %s", (pathname) => {
    expect(shouldHydrateOrganizationContext(pathname)).toBeTruthy();
  });

  it.each([
    "/login",
    "/signup",
    "/location-access",
    "/create-organization",
    "/forgot-password",
  ])("does not hydrate organization context for %s", (pathname) => {
    expect(shouldHydrateOrganizationContext(pathname)).toBeFalsy();
  });

  it.each(["/create-organization", "/location-access"])(
    "bypasses the authenticated app shell for %s",
    (pathname) => {
      expect(shouldBypassAuthenticatedAppShell(pathname)).toBeTruthy();
    }
  );

  it.each(["/", "/jobs", "/sites", "/settings"])(
    "keeps the authenticated app shell for %s",
    (pathname) => {
      expect(shouldBypassAuthenticatedAppShell(pathname)).toBeFalsy();
    }
  );
});

describe("app context request middleware payload", () => {
  let originalApiOrigin: string | undefined;
  let originalTenantBaseDomain: string | undefined;
  let originalTenantHostMode: string | undefined;
  let originalTenantReservedHostnames: string | undefined;
  let originalTenantStageAlias: string | undefined;

  beforeEach(() => {
    originalApiOrigin = process.env.API_ORIGIN;
    originalTenantBaseDomain = process.env.VITE_TENANT_BASE_DOMAIN;
    originalTenantHostMode = process.env.VITE_TENANT_HOST_MODE;
    originalTenantReservedHostnames =
      process.env.VITE_TENANT_RESERVED_HOSTNAMES;
    originalTenantStageAlias = process.env.VITE_TENANT_STAGE_ALIAS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    if (originalApiOrigin === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env.API_ORIGIN;
    } else {
      process.env.API_ORIGIN = originalApiOrigin;
    }
    if (originalTenantBaseDomain === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env.VITE_TENANT_BASE_DOMAIN;
    } else {
      process.env.VITE_TENANT_BASE_DOMAIN = originalTenantBaseDomain;
    }
    if (originalTenantHostMode === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env.VITE_TENANT_HOST_MODE;
    } else {
      process.env.VITE_TENANT_HOST_MODE = originalTenantHostMode;
    }
    if (originalTenantReservedHostnames === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env.VITE_TENANT_RESERVED_HOSTNAMES;
    } else {
      process.env.VITE_TENANT_RESERVED_HOSTNAMES =
        originalTenantReservedHostnames;
    }
    if (originalTenantStageAlias === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env.VITE_TENANT_STAGE_ALIAS;
    } else {
      process.env.VITE_TENANT_STAGE_ALIAS = originalTenantStageAlias;
    }
  });

  it("skips request context for routes outside the app/auth lane", async () => {
    await expect(
      loadRequestAppContextMiddlewareContext({
        pathname: "/health",
        request: buildAuthRequest(),
      })
    ).resolves.toBeUndefined();
  });

  it("builds an auth-only request context for public auth routes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      loadRequestAppContextMiddlewareContext({
        pathname: "/login",
        request: new Request("https://app.example.com/login"),
      })
    ).resolves.toStrictEqual({
      authSession: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves the raw OAuth consent search string for signed query validation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const requestSearch =
      "?client_id=signed-client&scope=openid%20ceird%3Aread&sig=abc&client_id=forged-client";

    await expect(
      loadRequestAppContextMiddlewareContext({
        pathname: "/oauth/consent",
        request: new Request(
          `https://app.example.com/oauth/consent${requestSearch}`
        ),
      })
    ).resolves.toStrictEqual({
      authSession: null,
      requestSearch,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds an organization-hydrated request context for organization routes", async () => {
    const organizations = [
      { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
    ];

    process.env.API_ORIGIN = "https://api.example.com";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          createBetterAuthSessionPayload(authSessionWithActiveOrganization)
        )
      )
      .mockResolvedValueOnce(Response.json(organizations))
      .mockResolvedValueOnce(Response.json({ role: "admin" }));

    await expect(
      loadRequestAppContextMiddlewareContext({
        pathname: "/jobs",
        request: buildAuthRequest(),
      })
    ).resolves.toStrictEqual({
      activeOrganizationId: "org_123",
      authSession: authSessionWithActiveOrganization,
      currentOrganizationRole: "admin",
      organizations,
    });
  });

  it("does not expose the session active organization on auth-only tenant routes", async () => {
    process.env.API_ORIGIN = "https://api.example.com";
    vi.stubEnv("VITE_TENANT_BASE_DOMAIN", "ceird.app");
    vi.stubEnv("VITE_TENANT_HOST_MODE", "stage");
    vi.stubEnv("VITE_TENANT_RESERVED_HOSTNAMES", "app.pr-123.ceird.app");
    vi.stubEnv("VITE_TENANT_STAGE_ALIAS", "pr-123");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          createBetterAuthSessionPayload(authSessionWithActiveOrganization)
        )
      );

    const context = await loadRequestAppContextMiddlewareContext({
      pathname: "/settings",
      request: new Request(
        "https://unknown-field-ops--pr-123.ceird.app/settings",
        {
          headers: {
            cookie: "better-auth.session_token=session-token",
            host: "unknown-field-ops--pr-123.ceird.app",
          },
        }
      ),
    });

    expect(context).toStrictEqual({
      activeOrganizationId: null,
      authSession: authSessionWithActiveOrganization,
      requestedOrganizationSlug: "unknown-field-ops",
    });
    expect(context).not.toHaveProperty("currentOrganizationRole");
    expect(context).not.toHaveProperty("organizations");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("resolves the route request context active organization from a tenant host", async () => {
    const organizations = [
      { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
      { id: "org_456", name: "Beta Field Ops", slug: "beta-field-ops" },
    ];

    process.env.API_ORIGIN = "https://api.example.com";
    vi.stubEnv("VITE_TENANT_BASE_DOMAIN", "ceird.app");
    vi.stubEnv("VITE_TENANT_HOST_MODE", "stage");
    vi.stubEnv("VITE_TENANT_RESERVED_HOSTNAMES", "app.pr-123.ceird.app");
    vi.stubEnv("VITE_TENANT_STAGE_ALIAS", "pr-123");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          createBetterAuthSessionPayload(authSessionWithActiveOrganization)
        )
      )
      .mockResolvedValueOnce(Response.json(organizations))
      .mockResolvedValueOnce(Response.json({ role: "admin" }));

    await expect(
      loadRequestAppContextMiddlewareContext({
        pathname: "/jobs",
        request: new Request("https://beta-field-ops--pr-123.ceird.app/jobs", {
          headers: {
            cookie: "better-auth.session_token=session-token",
            host: "beta-field-ops--pr-123.ceird.app",
          },
        }),
      })
    ).resolves.toStrictEqual({
      activeOrganizationId: "org_456",
      authSession: authSessionWithActiveOrganization,
      currentOrganizationRole: "admin",
      organizations,
      requestedOrganizationSlug: "beta-field-ops",
    });
  });

  it("ignores spoofed forwarded tenant hosts on public system hosts", async () => {
    const organizations = [
      { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
      { id: "org_456", name: "Beta Field Ops", slug: "beta-field-ops" },
    ];

    process.env.API_ORIGIN = "https://api.example.com";
    vi.stubEnv("VITE_TENANT_BASE_DOMAIN", "ceird.app");
    vi.stubEnv("VITE_TENANT_HOST_MODE", "stage");
    vi.stubEnv("VITE_TENANT_RESERVED_HOSTNAMES", "app.pr-123.ceird.app");
    vi.stubEnv("VITE_TENANT_STAGE_ALIAS", "pr-123");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          createBetterAuthSessionPayload(authSessionWithActiveOrganization)
        )
      )
      .mockResolvedValueOnce(Response.json(organizations))
      .mockResolvedValueOnce(Response.json({ role: "owner" }));

    const context = await loadRequestAppContextMiddlewareContext({
      pathname: "/jobs",
      request: new Request("https://app.pr-123.ceird.app/jobs", {
        headers: {
          cookie: "better-auth.session_token=session-token",
          host: "app.pr-123.ceird.app",
          "x-forwarded-host": "beta-field-ops--pr-123.ceird.app",
        },
      }),
    });

    expect(context).toStrictEqual({
      activeOrganizationId: "org_123",
      authSession: authSessionWithActiveOrganization,
      currentOrganizationRole: "owner",
      organizations,
    });
    expect(context).not.toHaveProperty("requestedOrganizationSlug");
  });

  it("honors forwarded tenant hosts from trusted local proxy hosts", async () => {
    const organizations = [
      { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
      { id: "org_456", name: "Beta Field Ops", slug: "beta-field-ops" },
    ];

    process.env.API_ORIGIN = "https://api.example.com";
    vi.stubEnv("VITE_TENANT_BASE_DOMAIN", "ceird.app");
    vi.stubEnv("VITE_TENANT_HOST_MODE", "stage");
    vi.stubEnv("VITE_TENANT_RESERVED_HOSTNAMES", "app.pr-123.ceird.app");
    vi.stubEnv("VITE_TENANT_STAGE_ALIAS", "pr-123");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          createBetterAuthSessionPayload(authSessionWithActiveOrganization)
        )
      )
      .mockResolvedValueOnce(Response.json(organizations))
      .mockResolvedValueOnce(Response.json({ role: "admin" }));

    await expect(
      loadRequestAppContextMiddlewareContext({
        pathname: "/jobs",
        request: new Request("http://127.0.0.1:4173/jobs", {
          headers: {
            cookie: "better-auth.session_token=session-token",
            host: "127.0.0.1:4173",
            "x-forwarded-host": "beta-field-ops--pr-123.ceird.app",
          },
        }),
      })
    ).resolves.toStrictEqual({
      activeOrganizationId: "org_456",
      authSession: authSessionWithActiveOrganization,
      currentOrganizationRole: "admin",
      organizations,
      requestedOrganizationSlug: "beta-field-ops",
    });
  });

  it("fails closed when the requested tenant slug is not accessible", async () => {
    const organizations = [
      { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
    ];

    process.env.API_ORIGIN = "https://api.example.com";
    vi.stubEnv("VITE_TENANT_BASE_DOMAIN", "ceird.app");
    vi.stubEnv("VITE_TENANT_HOST_MODE", "stage");
    vi.stubEnv("VITE_TENANT_RESERVED_HOSTNAMES", "app.pr-123.ceird.app");
    vi.stubEnv("VITE_TENANT_STAGE_ALIAS", "pr-123");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          createBetterAuthSessionPayload(authSessionWithActiveOrganization)
        )
      )
      .mockResolvedValueOnce(Response.json(organizations))
      .mockResolvedValueOnce(Response.json({ role: "owner" }));

    const context = await loadRequestAppContextMiddlewareContext({
      pathname: "/jobs",
      request: new Request("https://gamma-field-ops--pr-123.ceird.app/jobs", {
        headers: {
          cookie: "better-auth.session_token=session-token",
          host: "gamma-field-ops--pr-123.ceird.app",
        },
      }),
    });

    expect(context).toStrictEqual({
      activeOrganizationId: null,
      authSession: authSessionWithActiveOrganization,
      requestedOrganizationSlug: "gamma-field-ops",
    });
    expect(context).not.toHaveProperty("currentOrganizationRole");
    expect(context).not.toHaveProperty("organizations");
  });

  it.each([
    {
      configureTenantEnv: clearTenantHostEnv,
      name: "missing tenant env",
    },
    {
      configureTenantEnv: () => {
        vi.stubEnv("VITE_TENANT_BASE_DOMAIN", "ceird.app");
        vi.stubEnv("VITE_TENANT_HOST_MODE", "disabled");
        vi.stubEnv("VITE_TENANT_RESERVED_HOSTNAMES", "app.pr-123.ceird.app");
        vi.stubEnv("VITE_TENANT_STAGE_ALIAS", "pr-123");
      },
      name: "disabled tenant host mode",
    },
  ])(
    "ignores tenant-looking route request hosts with $name",
    async ({ configureTenantEnv }) => {
      const organizations = [
        { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
        { id: "org_456", name: "Beta Field Ops", slug: "beta-field-ops" },
      ];

      process.env.API_ORIGIN = "https://api.example.com";
      configureTenantEnv();
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          Response.json(
            createBetterAuthSessionPayload(authSessionWithActiveOrganization)
          )
        )
        .mockResolvedValueOnce(Response.json(organizations))
        .mockResolvedValueOnce(Response.json({ role: "owner" }));

      const context = await loadRequestAppContextMiddlewareContext({
        pathname: "/jobs",
        request: new Request("https://app.pr-123.ceird.app/jobs", {
          headers: {
            cookie: "better-auth.session_token=session-token",
            host: "app.pr-123.ceird.app",
            "x-forwarded-host": "beta-field-ops--pr-123.ceird.app",
          },
        }),
      });

      expect(context).toStrictEqual({
        activeOrganizationId: "org_123",
        authSession: authSessionWithActiveOrganization,
        currentOrganizationRole: "owner",
        organizations,
      });
      expect(context).not.toHaveProperty("requestedOrganizationSlug");
    }
  );
});

describe("app auth context snapshot for request", () => {
  let originalApiOrigin: string | undefined;
  let originalTenantBaseDomain: string | undefined;
  let originalTenantHostMode: string | undefined;
  let originalTenantReservedHostnames: string | undefined;
  let originalTenantStageAlias: string | undefined;

  beforeEach(() => {
    originalApiOrigin = process.env.API_ORIGIN;
    originalTenantBaseDomain = process.env.VITE_TENANT_BASE_DOMAIN;
    originalTenantHostMode = process.env.VITE_TENANT_HOST_MODE;
    originalTenantReservedHostnames =
      process.env.VITE_TENANT_RESERVED_HOSTNAMES;
    originalTenantStageAlias = process.env.VITE_TENANT_STAGE_ALIAS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    if (originalApiOrigin === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env.API_ORIGIN;
    } else {
      process.env.API_ORIGIN = originalApiOrigin;
    }
    if (originalTenantBaseDomain === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env.VITE_TENANT_BASE_DOMAIN;
    } else {
      process.env.VITE_TENANT_BASE_DOMAIN = originalTenantBaseDomain;
    }
    if (originalTenantHostMode === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env.VITE_TENANT_HOST_MODE;
    } else {
      process.env.VITE_TENANT_HOST_MODE = originalTenantHostMode;
    }
    if (originalTenantReservedHostnames === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env.VITE_TENANT_RESERVED_HOSTNAMES;
    } else {
      process.env.VITE_TENANT_RESERVED_HOSTNAMES =
        originalTenantReservedHostnames;
    }
    if (originalTenantStageAlias === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env.VITE_TENANT_STAGE_ALIAS;
    } else {
      process.env.VITE_TENANT_STAGE_ALIAS = originalTenantStageAlias;
    }
  });

  it("resolves an auth-only request without a session to an empty auth snapshot", async () => {
    process.env.API_ORIGIN = "https://api.example.com";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const snapshot = await buildAppAuthContextSnapshotForRequest(
      new Request("https://app.example.com/login")
    );

    expect(snapshot).toStrictEqual({
      activeOrganizationId: null,
      session: null,
    });
    expect(snapshot).not.toHaveProperty("organizations");
    expect(snapshot).not.toHaveProperty("currentOrganizationRole");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves an organization-hydrated request with the session, active organization, organizations, and current role", async () => {
    const organizations = [
      { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
    ];
    process.env.API_ORIGIN = "https://api.example.com";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          createBetterAuthSessionPayload(authSessionWithActiveOrganization)
        )
      )
      .mockResolvedValueOnce(Response.json(organizations))
      .mockResolvedValueOnce(Response.json({ role: "owner" }));

    await expect(
      buildAppAuthContextSnapshotForRequest(buildAuthRequest(), {
        hydrateOrganizationContext: true,
      })
    ).resolves.toStrictEqual({
      activeOrganizationId: "org_123",
      currentOrganizationRole: "owner",
      organizations,
      session: authSessionWithActiveOrganization,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("organization/list", "https://api.example.com/api/auth/"),
      {
        headers: {
          accept: "application/json",
          cookie: "better-auth.session_token=session-token",
        },
      }
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "organization/get-active-member-role?organizationId=org_123",
        "https://api.example.com/api/auth/"
      ),
      {
        headers: {
          accept: "application/json",
          cookie: "better-auth.session_token=session-token",
        },
      }
    );
  });

  it("skips organization and role lookups for an active-organization session when organization hydration is disabled", async () => {
    process.env.API_ORIGIN = "https://api.example.com";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          createBetterAuthSessionPayload(authSessionWithActiveOrganization)
        )
      );

    await expect(
      buildAppAuthContextSnapshotForRequest(buildAuthRequest(), {
        hydrateOrganizationContext: false,
      })
    ).resolves.toStrictEqual({
      activeOrganizationId: "org_123",
      session: authSessionWithActiveOrganization,
    });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      new URL("get-session", "https://api.example.com/api/auth/"),
      {
        headers: {
          accept: "application/json",
          cookie: "better-auth.session_token=session-token",
        },
      }
    );
  });

  it("hydrates organization context from a known session without fetching the session again", async () => {
    const organizations = [
      { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
    ];
    const knownSession = authSessionWithActiveOrganization;
    process.env.API_ORIGIN = "https://api.example.com";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(organizations))
      .mockResolvedValueOnce(Response.json({ role: "admin" }));

    await expect(
      buildAppAuthContextSnapshotForRequest(buildAuthRequest(), {
        hydrateOrganizationContext: true,
        session: knownSession,
      })
    ).resolves.toStrictEqual({
      activeOrganizationId: "org_123",
      currentOrganizationRole: "admin",
      organizations,
      session: knownSession,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalledWith(
      new URL("get-session", "https://api.example.com/api/auth/"),
      expect.anything()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("organization/list", "https://api.example.com/api/auth/"),
      expect.anything()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "organization/get-active-member-role?organizationId=org_123",
        "https://api.example.com/api/auth/"
      ),
      expect.anything()
    );
  });

  it("starts organization and role lookups in parallel for the default known-active-organization path", async () => {
    const organizations = [
      { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
    ];
    const knownSession = authSessionWithActiveOrganization;
    const organizationsDeferred = createDeferredResponse();
    const roleDeferred = createDeferredResponse();
    process.env.API_ORIGIN = "https://api.example.com";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) => {
        const url = input instanceof URL ? input : new URL(String(input));

        if (url.pathname.endsWith("/organization/list")) {
          return organizationsDeferred.promise;
        }

        if (url.pathname.endsWith("/organization/get-active-member-role")) {
          return roleDeferred.promise;
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url.toString()}`));
      });

    const snapshotPromise = buildAppAuthContextSnapshotForRequest(
      buildAuthRequest(),
      {
        hydrateOrganizationContext: true,
        session: knownSession,
      }
    );

    await Promise.resolve();
    const fetchCountBeforeResolvingEitherResponse = fetchMock.mock.calls.length;
    organizationsDeferred.resolve(Response.json(organizations));
    roleDeferred.resolve(Response.json({ role: "owner" }));

    await expect(snapshotPromise).resolves.toStrictEqual({
      activeOrganizationId: "org_123",
      currentOrganizationRole: "owner",
      organizations,
      session: knownSession,
    });
    expect(fetchCountBeforeResolvingEitherResponse).toBe(2);
  });

  it("resolves a missing active organization from the first organization without fetching the session again", async () => {
    const authSessionWithoutActiveOrganization: ServerAuthSession = {
      ...authSessionWithActiveOrganization,
      session: {
        ...authSessionWithActiveOrganization.session,
        activeOrganizationId: null,
      },
    };
    const organizations = [
      { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
      { id: "org_456", name: "Beta Field Ops", slug: "beta-field-ops" },
    ];
    process.env.API_ORIGIN = "https://api.example.com";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(organizations))
      .mockResolvedValueOnce(Response.json({ role: "owner" }));

    await expect(
      buildAppAuthContextSnapshotForRequest(buildAuthRequest(), {
        hydrateOrganizationContext: true,
        resolveActiveOrganizationFromList: true,
        session: authSessionWithoutActiveOrganization,
      })
    ).resolves.toStrictEqual({
      activeOrganizationId: "org_123",
      currentOrganizationRole: "owner",
      organizations,
      session: authSessionWithoutActiveOrganization,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalledWith(
      new URL("get-session", "https://api.example.com/api/auth/"),
      expect.anything()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "organization/get-active-member-role?organizationId=org_123",
        "https://api.example.com/api/auth/"
      ),
      expect.anything()
    );
  });

  it("prefers the organization requested by a tenant host over the session active organization", async () => {
    const organizations = [
      { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
      { id: "org_456", name: "Beta Field Ops", slug: "beta-field-ops" },
    ];
    process.env.API_ORIGIN = "https://api.example.com";
    vi.stubEnv("VITE_TENANT_BASE_DOMAIN", "ceird.app");
    vi.stubEnv("VITE_TENANT_HOST_MODE", "stage");
    vi.stubEnv("VITE_TENANT_RESERVED_HOSTNAMES", "app.pr-123.ceird.app");
    vi.stubEnv("VITE_TENANT_STAGE_ALIAS", "pr-123");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(organizations))
      .mockResolvedValueOnce(Response.json({ role: "admin" }));

    const snapshot = await buildAppAuthContextSnapshotForRequest(
      new Request("https://beta-field-ops--pr-123.ceird.app/jobs", {
        headers: {
          cookie: "better-auth.session_token=session-token",
          host: "beta-field-ops--pr-123.ceird.app",
        },
      }),
      {
        hydrateOrganizationContext: true,
        resolveActiveOrganizationFromList: true,
        session: authSessionWithActiveOrganization,
      }
    );

    expect(snapshot.activeOrganizationId).toBe("org_456");
    expect(snapshot.requestedOrganizationSlug).toBe("beta-field-ops");
    expect(snapshot).toStrictEqual({
      activeOrganizationId: "org_456",
      currentOrganizationRole: "admin",
      organizations,
      requestedOrganizationSlug: "beta-field-ops",
      session: authSessionWithActiveOrganization,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "organization/get-active-member-role?organizationId=org_456",
        "https://api.example.com/api/auth/"
      ),
      expect.anything()
    );
  });

  it("resolves a stale active organization from the first organization and reads that role", async () => {
    const authSessionWithStaleActiveOrganization: ServerAuthSession = {
      ...authSessionWithActiveOrganization,
      session: {
        ...authSessionWithActiveOrganization.session,
        activeOrganizationId: decodeOrganizationId("org_stale"),
      },
    };
    const organizations = [
      { id: "org_456", name: "Beta Field Ops", slug: "beta-field-ops" },
      { id: "org_789", name: "Gamma Field Ops", slug: "gamma-field-ops" },
    ];
    process.env.API_ORIGIN = "https://api.example.com";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(organizations))
      .mockResolvedValueOnce(Response.json({ role: "external" }))
      .mockResolvedValueOnce(Response.json({ role: "admin" }));

    await expect(
      buildAppAuthContextSnapshotForRequest(buildAuthRequest(), {
        hydrateOrganizationContext: true,
        resolveActiveOrganizationFromList: true,
        session: authSessionWithStaleActiveOrganization,
      })
    ).resolves.toStrictEqual({
      activeOrganizationId: "org_456",
      currentOrganizationRole: "admin",
      organizations,
      session: authSessionWithStaleActiveOrganization,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "organization/get-active-member-role?organizationId=org_456",
        "https://api.example.com/api/auth/"
      ),
      expect.anything()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "organization/get-active-member-role?organizationId=org_stale",
        "https://api.example.com/api/auth/"
      ),
      expect.anything()
    );
  });

  it("preserves default organization hydration behavior when active organization is missing", async () => {
    const authSessionWithoutActiveOrganization: ServerAuthSession = {
      ...authSessionWithActiveOrganization,
      session: {
        ...authSessionWithActiveOrganization.session,
        activeOrganizationId: null,
      },
    };
    process.env.API_ORIGIN = "https://api.example.com";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      buildAppAuthContextSnapshotForRequest(buildAuthRequest(), {
        hydrateOrganizationContext: true,
        session: authSessionWithoutActiveOrganization,
      })
    ).resolves.toStrictEqual({
      activeOrganizationId: null,
      session: authSessionWithoutActiveOrganization,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when organization list lookup fails", async () => {
    process.env.API_ORIGIN = "https://api.example.com";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          createBetterAuthSessionPayload(authSessionWithActiveOrganization)
        )
      )
      .mockResolvedValueOnce(new Response("boom", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ role: "owner" }));

    await expect(
      buildAppAuthContextSnapshotForRequest(buildAuthRequest(), {
        hydrateOrganizationContext: true,
      })
    ).rejects.toThrow("Organization lookup failed with status 503.");
  });

  it("keeps organizations when role lookup fails", async () => {
    const organizations = [
      { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
    ];
    process.env.API_ORIGIN = "https://api.example.com";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          createBetterAuthSessionPayload(authSessionWithActiveOrganization)
        )
      )
      .mockResolvedValueOnce(Response.json(organizations))
      .mockResolvedValueOnce(new Response("boom", { status: 503 }));

    const snapshot = await buildAppAuthContextSnapshotForRequest(
      buildAuthRequest(),
      {
        hydrateOrganizationContext: true,
      }
    );

    expect(snapshot).toStrictEqual({
      activeOrganizationId: "org_123",
      currentOrganizationRole: undefined,
      organizations,
      session: authSessionWithActiveOrganization,
    });
  });

  it("skips organization and role lookups when the session has no active organization", async () => {
    const authSessionWithoutActiveOrganization: ServerAuthSession = {
      ...authSessionWithActiveOrganization,
      session: {
        ...authSessionWithActiveOrganization.session,
        activeOrganizationId: null,
      },
    };
    process.env.API_ORIGIN = "https://api.example.com";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          createBetterAuthSessionPayload(authSessionWithoutActiveOrganization)
        )
      );

    await expect(
      buildAppAuthContextSnapshotForRequest(buildAuthRequest(), {
        hydrateOrganizationContext: true,
      })
    ).resolves.toStrictEqual({
      activeOrganizationId: null,
      session: authSessionWithoutActiveOrganization,
    });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      new URL("get-session", "https://api.example.com/api/auth/"),
      {
        headers: {
          accept: "application/json",
          cookie: "better-auth.session_token=session-token",
        },
      }
    );
  });
});
