import type { OrganizationId } from "@ceird/identity-core";

const { mockedGetCurrentOrganizationMemberRole, mockedRequireSession } =
  vi.hoisted(() => ({
    mockedGetCurrentOrganizationMemberRole: vi.fn<
      (organizationId: OrganizationId) => Promise<{
        role: "owner" | "admin" | "member" | "external";
      }>
    >(),
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

  it("falls back to no role when role lookup fails", async () => {
    const { loadAuthenticatedAppRoute } = await import("./_app");

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
