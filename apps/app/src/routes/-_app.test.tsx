import type { OrganizationId } from "@ceird/identity-core";
import { isRedirect } from "@tanstack/react-router";

const {
  mockedGetCachedClientAppContext,
  mockedGetCurrentOrganizationMemberRole,
  mockedIsServerEnvironment,
  mockedRequireSession,
} = vi.hoisted(() => ({
  mockedGetCachedClientAppContext: vi.fn<() => Promise<unknown>>(),
  mockedGetCurrentOrganizationMemberRole: vi.fn<
    (organizationId: OrganizationId) => Promise<{
      role: "owner" | "admin" | "member" | "external";
    }>
  >(),
  mockedIsServerEnvironment: vi.fn<() => boolean>(),
  mockedRequireSession: vi.fn<
    () => Promise<{
      session: {
        activeOrganizationId?: string | null;
      };
      user: {
        email: string;
        id: string;
        name: string;
      };
    }>
  >(),
}));

vi.mock(
  import("#/features/auth/app-context-client-cache"),
  async (importActual) => {
    const actual = await importActual();

    return {
      ...actual,
      getCachedClientAppContext:
        mockedGetCachedClientAppContext as unknown as typeof actual.getCachedClientAppContext,
    };
  }
);

vi.mock(import("#/features/auth/runtime-environment"), () => ({
  isServerEnvironment: mockedIsServerEnvironment,
}));

vi.mock(
  import("#/features/auth/require-authenticated-session"),
  async (importActual) => {
    const actual = await importActual();

    return {
      ...actual,
      requireAuthenticatedSession:
        mockedRequireSession as unknown as typeof actual.requireAuthenticatedSession,
    };
  }
);

vi.mock(
  import("#/features/organizations/organization-access"),
  async (importActual) => {
    const actual = await importActual();

    return {
      ...actual,
      getCurrentOrganizationMemberRole:
        mockedGetCurrentOrganizationMemberRole as unknown as typeof actual.getCurrentOrganizationMemberRole,
    };
  }
);

describe("authenticated app route loader", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("decodes the active organization id and refreshes the current role", async () => {
    const { loadAuthenticatedAppRoute } = await import("./_app");

    mockedIsServerEnvironment.mockReturnValue(true);
    mockedRequireSession.mockResolvedValue({
      session: { activeOrganizationId: "org_active" },
      user: {
        email: "taylor@example.com",
        id: "user_123",
        name: "Taylor Example",
      },
    });
    mockedGetCurrentOrganizationMemberRole.mockResolvedValue({
      role: "admin",
    });

    await expect(loadAuthenticatedAppRoute()).resolves.toStrictEqual({
      activeOrganizationId: "org_active",
      currentOrganizationRole: "admin",
      session: {
        session: { activeOrganizationId: "org_active" },
        user: {
          email: "taylor@example.com",
          id: "user_123",
          name: "Taylor Example",
        },
      },
    });
    expect(mockedGetCurrentOrganizationMemberRole).toHaveBeenCalledWith(
      "org_active"
    );
  });

  it("skips role lookup when the session has no active organization", async () => {
    const { loadAuthenticatedAppRoute } = await import("./_app");

    mockedIsServerEnvironment.mockReturnValue(true);
    mockedRequireSession.mockResolvedValue({
      session: { activeOrganizationId: null },
      user: {
        email: "taylor@example.com",
        id: "user_123",
        name: "Taylor Example",
      },
    });

    await expect(loadAuthenticatedAppRoute()).resolves.toMatchObject({
      activeOrganizationId: null,
      currentOrganizationRole: undefined,
    });
    expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
  });

  it("uses request middleware auth context without reloading the session or role", async () => {
    const { loadAuthenticatedAppRoute } = await import("./_app");

    mockedIsServerEnvironment.mockReturnValue(true);
    await expect(
      loadAuthenticatedAppRoute({
        serverContext: {
          authSession: {
            session: { activeOrganizationId: "org_active" },
            user: {
              email: "taylor@example.com",
              id: "user_123",
              name: "Taylor Example",
            },
          },
          currentOrganizationRole: "owner",
        },
      })
    ).resolves.toStrictEqual({
      activeOrganizationId: "org_active",
      currentOrganizationRole: "owner",
      session: {
        session: { activeOrganizationId: "org_active" },
        user: {
          email: "taylor@example.com",
          id: "user_123",
          name: "Taylor Example",
        },
      },
    });
    expect(mockedRequireSession).not.toHaveBeenCalled();
    expect(mockedGetCachedClientAppContext).not.toHaveBeenCalled();
    expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
  });

  it("uses the browser app context snapshot when request auth context is absent during client navigation", async () => {
    const { loadAuthenticatedAppRoute } = await import("./_app");

    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCachedClientAppContext.mockResolvedValue({
      session: {
        session: { activeOrganizationId: "org_active" },
        user: {
          email: "taylor@example.com",
          id: "user_123",
          name: "Taylor Example",
        },
      },
      activeOrganizationId: "org_active",
      currentOrganizationRole: "admin",
    });

    await expect(loadAuthenticatedAppRoute()).resolves.toStrictEqual({
      activeOrganizationId: "org_active",
      currentOrganizationRole: "admin",
      session: {
        session: { activeOrganizationId: "org_active" },
        user: {
          email: "taylor@example.com",
          id: "user_123",
          name: "Taylor Example",
        },
      },
    });
    expect(mockedGetCachedClientAppContext).toHaveBeenCalledOnce();
    expect(mockedRequireSession).not.toHaveBeenCalled();
    expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
  });

  it("redirects from the browser app context snapshot when no session exists", async () => {
    const { loadAuthenticatedAppRoute } = await import("./_app");

    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCachedClientAppContext.mockResolvedValue({
      session: null,
      activeOrganizationId: null,
    });

    const result = loadAuthenticatedAppRoute();

    await expect(result).rejects.toMatchObject({
      options: {
        search: {
          invitation: undefined,
        },
        to: "/login",
      },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
    expect(mockedGetCachedClientAppContext).toHaveBeenCalledOnce();
    expect(mockedRequireSession).not.toHaveBeenCalled();
  });

  it("falls back to no role when role lookup fails", async () => {
    const { loadAuthenticatedAppRoute } = await import("./_app");

    mockedIsServerEnvironment.mockReturnValue(true);
    mockedRequireSession.mockResolvedValue({
      session: { activeOrganizationId: "org_active" },
      user: {
        email: "taylor@example.com",
        id: "user_123",
        name: "Taylor Example",
      },
    });
    mockedGetCurrentOrganizationMemberRole.mockRejectedValue(
      new Error("role lookup failed")
    );

    await expect(loadAuthenticatedAppRoute()).resolves.toMatchObject({
      activeOrganizationId: "org_active",
      currentOrganizationRole: undefined,
    });
  });
});
