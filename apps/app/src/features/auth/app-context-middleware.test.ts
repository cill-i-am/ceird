import {
  shouldHydrateAuthContext,
  shouldHydrateOrganizationContext,
} from "./app-context-middleware";
import { buildAppAuthContextSnapshotForRequest } from "./auth-request-context.server";

interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  expiresAt: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  activeOrganizationId?: string | null;
}

interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuthSession {
  session: Session;
  user: User;
}

const authSessionWithActiveOrganization: AuthSession = {
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
};

function buildAuthRequest() {
  return new Request("https://app.example.com/", {
    headers: {
      cookie: "better-auth.session_token=session-token",
    },
  });
}

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
    const authSessionWithoutActiveOrganization: AuthSession = {
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
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
