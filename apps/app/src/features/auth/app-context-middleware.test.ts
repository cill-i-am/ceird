import {
  optionalAuthFunctionMiddleware,
  organizationAdminFunctionMiddleware,
  organizationFunctionMiddleware,
  requiredAuthFunctionMiddleware,
  shouldHydrateAuthContext,
  shouldHydrateOrganizationContext,
} from "./app-context-middleware";
import { decodeServerAuthSession } from "./app-context-types";
import type { ServerAuthSession } from "./app-context-types";
import { buildAppAuthContextSnapshotForRequest } from "./auth-request-context.server";

const authSessionWithActiveOrganization: ServerAuthSession =
  decodeServerAuthSession({
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
      createdAt: "2026-04-04T17:08:12.488Z",
      updatedAt: "2026-04-04T17:08:12.488Z",
    },
  });

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
    expect(shouldHydrateAuthContext(pathname)).toBeTruthy();
  });

  it("does not hydrate auth context for the health route", () => {
    expect(shouldHydrateAuthContext("/health")).toBeFalsy();
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
    expect(shouldHydrateOrganizationContext(pathname)).toBeTruthy();
  });

  it.each(["/login", "/signup", "/create-organization", "/forgot-password"])(
    "does not hydrate organization context for %s",
    (pathname) => {
      expect(shouldHydrateOrganizationContext(pathname)).toBeFalsy();
    }
  );
});

describe("app auth context snapshot for request", () => {
  let originalApiOrigin: string | undefined;

  beforeEach(() => {
    originalApiOrigin = process.env.API_ORIGIN;
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
      .mockResolvedValueOnce(Response.json(authSessionWithActiveOrganization))
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
      .mockResolvedValueOnce(Response.json(authSessionWithActiveOrganization));

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
    const authSessionWithoutActiveOrganization = decodeServerAuthSession({
      ...authSessionWithActiveOrganization,
      session: {
        ...authSessionWithActiveOrganization.session,
        activeOrganizationId: null,
      },
    });
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

  it("resolves a stale active organization from the first organization and reads that role", async () => {
    const authSessionWithStaleActiveOrganization = decodeServerAuthSession({
      ...authSessionWithActiveOrganization,
      session: {
        ...authSessionWithActiveOrganization.session,
        activeOrganizationId: "org_stale",
      },
    });
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
    const authSessionWithoutActiveOrganization = decodeServerAuthSession({
      ...authSessionWithActiveOrganization,
      session: {
        ...authSessionWithActiveOrganization.session,
        activeOrganizationId: null,
      },
    });
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
      .mockResolvedValueOnce(Response.json(authSessionWithActiveOrganization))
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
      .mockResolvedValueOnce(Response.json(authSessionWithActiveOrganization))
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
        Response.json(authSessionWithoutActiveOrganization)
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
