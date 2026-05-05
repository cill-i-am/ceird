import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { isRedirect } from "@tanstack/react-router";

import {
  ensureActiveOrganizationId,
  listOrganizations,
  redirectIfOrganizationReady,
  requireOrganizationAdministrationAccess,
  requireOrganizationAccess,
} from "./organization-access";
import type { OrganizationSummary } from "./organization-access";

interface Session {
  session: {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
    userId?: string;
    expiresAt?: string;
    token?: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    activeOrganizationId?: string | null;
  };
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    emailVerified?: boolean;
    createdAt?: string;
    updatedAt?: string;
  };
}

interface Organization {
  id: string;
  name: string;
  slug: string;
}

const serverOrganizationId = decodeOrganizationId("org_server");

const {
  mockedGetStrictServerSession,
  mockedGetServerOrganizationMemberRole,
  mockedGetStrictServerOrganizations,
  mockedGetClientActiveMemberRole,
  mockedGetSession,
  mockedGetClientOrganizations,
  mockedSetClientActiveOrganization,
  mockedIsServerEnvironment,
} = vi.hoisted(() => ({
  mockedGetStrictServerSession: vi.fn<() => Promise<Session | null>>(),
  mockedGetServerOrganizationMemberRole:
    vi.fn<
      (organizationId: OrganizationId) => Promise<{ role: OrganizationRole }>
    >(),
  mockedGetStrictServerOrganizations:
    vi.fn<() => Promise<readonly OrganizationSummary[]>>(),
  mockedGetClientActiveMemberRole: vi.fn<
    (input: {
      query: {
        organizationId: string;
      };
    }) => Promise<{ data: { role: string } | null; error: Error | null }>
  >(),
  mockedGetSession:
    vi.fn<() => Promise<{ data: Session | null; error: Error | null }>>(),
  mockedGetClientOrganizations:
    vi.fn<
      () => Promise<{ data: Organization[] | null; error: Error | null }>
    >(),
  mockedSetClientActiveOrganization:
    vi.fn<
      (input: {
        organizationId: string | null;
      }) => Promise<{ data: Organization | null; error: Error | null }>
    >(),
  mockedIsServerEnvironment: vi.fn<() => boolean>(),
}));

vi.mock(import("./organization-server"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    getCurrentServerOrganizationMemberRole:
      mockedGetServerOrganizationMemberRole as typeof actual.getCurrentServerOrganizationMemberRole,
    getCurrentServerOrganizationSession:
      mockedGetStrictServerSession as typeof actual.getCurrentServerOrganizationSession,
    getCurrentServerOrganizations:
      mockedGetStrictServerOrganizations as typeof actual.getCurrentServerOrganizations,
  };
});

vi.mock(import("../auth/runtime-environment"), () => ({
  isServerEnvironment: mockedIsServerEnvironment,
}));

vi.mock(import("#/lib/auth-client"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    authClient: {
      ...actual.authClient,
      getSession: mockedGetSession as typeof actual.authClient.getSession,
      organization: {
        ...actual.authClient.organization,
        getActiveMemberRole:
          mockedGetClientActiveMemberRole as unknown as typeof actual.authClient.organization.getActiveMemberRole,
        list: mockedGetClientOrganizations as unknown as typeof actual.authClient.organization.list,
        setActive:
          mockedSetClientActiveOrganization as unknown as typeof actual.authClient.organization.setActive,
      },
    },
  };
});

describe("organization access helpers", () => {
  beforeEach(() => {
    mockedGetClientActiveMemberRole.mockResolvedValue({
      data: {
        role: "owner",
      },
      error: null,
    });
    mockedGetServerOrganizationMemberRole.mockResolvedValue({
      role: "owner",
    });
    mockedSetClientActiveOrganization.mockResolvedValue({
      data: null,
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists organizations on the client", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetClientOrganizations.mockResolvedValue({
      data: [{ id: "org_123", name: "Acme", slug: "acme" }],
      error: null,
    });

    await expect(listOrganizations()).resolves.toStrictEqual([
      { id: "org_123", name: "Acme", slug: "acme" },
    ]);
    expect(mockedGetStrictServerOrganizations).not.toHaveBeenCalled();
  }, 1000);

  it("uses the strict server list helper during SSR", async () => {
    mockedIsServerEnvironment.mockReturnValue(true);
    mockedGetStrictServerOrganizations.mockResolvedValue([
      { id: serverOrganizationId, name: "Server Org", slug: "server-org" },
    ]);

    await expect(listOrganizations()).resolves.toStrictEqual([
      { id: serverOrganizationId, name: "Server Org", slug: "server-org" },
    ]);
    expect(mockedGetStrictServerOrganizations).toHaveBeenCalledOnce();
  }, 1000);

  it("rethrows client organization lookup failures", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetClientOrganizations.mockResolvedValue({
      data: null,
      error: new Error("organization endpoint failed"),
    });

    const failure = await listOrganizations().catch(
      (caughtError) => caughtError
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(
      "organization endpoint failed"
    );
  }, 1000);

  it("redirects unauthenticated users to /login from ensureActiveOrganizationId", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({ data: null, error: null });

    const result = ensureActiveOrganizationId();

    await expect(result).rejects.toMatchObject({
      options: {
        search: {
          invitation: undefined,
        },
        to: "/login",
      },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("rethrows SSR session lookup failures during access checks", async () => {
    mockedIsServerEnvironment.mockReturnValue(true);
    mockedGetStrictServerSession.mockRejectedValue(
      new Error("server session down")
    );

    const failure = await requireOrganizationAccess().catch(
      (caughtError) => caughtError
    );

    const redirectFailure = isRedirect(failure);

    expect({ redirectFailure }).toStrictEqual({ redirectFailure: false });
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("server session down");
    expect(mockedGetStrictServerOrganizations).not.toHaveBeenCalled();
  }, 1000);

  it("rethrows invalid non-null SSR session payloads during access checks", async () => {
    mockedIsServerEnvironment.mockReturnValue(true);
    mockedGetStrictServerSession.mockRejectedValue(
      new Error("Session lookup returned an invalid payload.")
    );

    const failure = await requireOrganizationAccess().catch(
      (caughtError) => caughtError
    );

    const redirectFailure = isRedirect(failure);

    expect({ redirectFailure }).toStrictEqual({ redirectFailure: false });
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(
      "Session lookup returned an invalid payload."
    );
  }, 1000);

  it("keeps the active organization when it still exists in the current membership list", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: { activeOrganizationId: "org_active" },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });
    mockedGetClientOrganizations.mockResolvedValue({
      data: [{ id: "org_active", name: "Active Org", slug: "active-org" }],
      error: null,
    });

    await expect(ensureActiveOrganizationId()).resolves.toMatchObject({
      activeOrganization: {
        id: "org_active",
        name: "Active Org",
        slug: "active-org",
      },
      activeOrganizationId: "org_active",
      activeOrganizationSync: {
        required: false,
        targetOrganizationId: "org_active",
      },
    });
    expect(mockedGetClientOrganizations).toHaveBeenCalledOnce();
    expect(mockedSetClientActiveOrganization).not.toHaveBeenCalled();
  }, 1000);

  it("falls back to the first current organization when the active organization is stale", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: { activeOrganizationId: "org_stale" },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });
    mockedGetClientOrganizations.mockResolvedValue({
      data: [{ id: "org_current", name: "Current Org", slug: "current-org" }],
      error: null,
    });

    await expect(ensureActiveOrganizationId()).resolves.toStrictEqual({
      activeOrganization: {
        id: "org_current",
        name: "Current Org",
        slug: "current-org",
      },
      activeOrganizationId: "org_current",
      activeOrganizationSync: {
        required: true,
        targetOrganizationId: "org_current",
      },
      session: {
        session: {
          activeOrganizationId: "org_stale",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
    });
    expect(mockedSetClientActiveOrganization).not.toHaveBeenCalled();
  }, 1000);

  it("falls back to the first organization when there is no active organization", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {},
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });
    mockedGetClientOrganizations.mockResolvedValue({
      data: [
        { id: "org_first", name: "First Org", slug: "first-org" },
        { id: "org_second", name: "Second Org", slug: "second-org" },
      ],
      error: null,
    });

    await expect(ensureActiveOrganizationId()).resolves.toStrictEqual({
      activeOrganization: {
        id: "org_first",
        name: "First Org",
        slug: "first-org",
      },
      activeOrganizationId: "org_first",
      activeOrganizationSync: {
        required: true,
        targetOrganizationId: "org_first",
      },
      session: {
        session: {},
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
    });
    expect(mockedSetClientActiveOrganization).not.toHaveBeenCalled();
  }, 1000);

  it("redirects to /create-organization when there are no organizations", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {},
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });
    mockedGetClientOrganizations.mockResolvedValue({
      data: [],
      error: null,
    });

    const result = ensureActiveOrganizationId();

    await expect(result).rejects.toMatchObject({
      options: { href: "/create-organization" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
    expect(mockedSetClientActiveOrganization).not.toHaveBeenCalled();
  }, 1000);

  it("rethrows SSR organization lookup failures during access checks", async () => {
    mockedIsServerEnvironment.mockReturnValue(true);
    mockedGetStrictServerSession.mockResolvedValue({
      session: {
        id: "session_123",
        createdAt: "2026-04-04T17:08:12.497Z",
        updatedAt: "2026-04-04T17:08:12.497Z",
        userId: "user_123",
        expiresAt: "2026-04-11T17:08:12.497Z",
        token: "session-token",
        ipAddress: "",
        userAgent: "curl/8.7.1",
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
    mockedGetStrictServerOrganizations.mockRejectedValue(
      new Error("upstream unavailable")
    );

    const failure = await ensureActiveOrganizationId().catch(
      (caughtError) => caughtError
    );

    const redirectFailure = isRedirect(failure);

    expect({ redirectFailure }).toStrictEqual({ redirectFailure: false });
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("upstream unavailable");
    expect(mockedSetClientActiveOrganization).not.toHaveBeenCalled();
  }, 1000);

  it("uses the strict SSR organization list during access checks", async () => {
    mockedIsServerEnvironment.mockReturnValue(true);
    mockedGetStrictServerSession.mockResolvedValue({
      session: {
        id: "session_123",
        createdAt: "2026-04-04T17:08:12.497Z",
        updatedAt: "2026-04-04T17:08:12.497Z",
        userId: "user_123",
        expiresAt: "2026-04-11T17:08:12.497Z",
        token: "session-token",
        ipAddress: "",
        userAgent: "curl/8.7.1",
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
    mockedGetStrictServerOrganizations.mockResolvedValue([
      { id: serverOrganizationId, name: "Server Org", slug: "server-org" },
    ]);

    await expect(ensureActiveOrganizationId()).resolves.toStrictEqual({
      activeOrganization: {
        id: "org_server",
        name: "Server Org",
        slug: "server-org",
      },
      activeOrganizationId: "org_server",
      activeOrganizationSync: {
        required: true,
        targetOrganizationId: "org_server",
      },
      session: {
        session: {
          id: "session_123",
          createdAt: "2026-04-04T17:08:12.497Z",
          updatedAt: "2026-04-04T17:08:12.497Z",
          userId: "user_123",
          expiresAt: "2026-04-11T17:08:12.497Z",
          token: "session-token",
          ipAddress: "",
          userAgent: "curl/8.7.1",
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
      },
    });
    expect(mockedSetClientActiveOrganization).not.toHaveBeenCalled();
  }, 1000);

  it("defers organization administration role checks while active organization sync is pending", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {},
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });
    mockedGetClientOrganizations.mockResolvedValue({
      data: [{ id: "org_first", name: "First Org", slug: "first-org" }],
      error: null,
    });

    await expect(
      requireOrganizationAdministrationAccess()
    ).resolves.toMatchObject({
      activeOrganizationId: "org_first",
      activeOrganizationSync: {
        required: true,
        targetOrganizationId: "org_first",
      },
    });
    expect(mockedGetClientActiveMemberRole).not.toHaveBeenCalled();
  }, 1000);

  it("redirects authenticated users without organizations to /create-organization", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {},
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });
    mockedGetClientOrganizations.mockResolvedValue({
      data: [],
      error: null,
    });

    const result = requireOrganizationAccess();

    await expect(result).rejects.toMatchObject({
      options: { href: "/create-organization" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("allows admins and owners through organization administration checks", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          activeOrganizationId: "org_active",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });
    mockedGetClientOrganizations.mockResolvedValue({
      data: [{ id: "org_active", name: "Active Org", slug: "active-org" }],
      error: null,
    });
    mockedGetClientActiveMemberRole.mockResolvedValue({
      data: {
        role: "admin",
      },
      error: null,
    });

    await expect(
      requireOrganizationAdministrationAccess()
    ).resolves.toMatchObject({
      activeOrganization: {
        id: "org_active",
        name: "Active Org",
        slug: "active-org",
      },
      activeOrganizationId: "org_active",
    });
    expect(mockedGetClientActiveMemberRole).toHaveBeenCalledWith({
      query: {
        organizationId: "org_active",
      },
    });
  }, 1000);

  it("redirects non-admin members away from organization administration routes", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          activeOrganizationId: "org_active",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });
    mockedGetClientOrganizations.mockResolvedValue({
      data: [{ id: "org_active", name: "Active Org", slug: "active-org" }],
      error: null,
    });
    mockedGetClientActiveMemberRole.mockResolvedValue({
      data: {
        role: "member",
      },
      error: null,
    });

    const result = requireOrganizationAdministrationAccess();

    await expect(result).rejects.toMatchObject({
      options: { to: "/" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("redirects unauthenticated users to /login from redirectIfOrganizationReady", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({ data: null, error: null });

    const result = redirectIfOrganizationReady();

    await expect(result).rejects.toMatchObject({
      options: {
        search: {
          invitation: undefined,
        },
        to: "/login",
      },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("rethrows SSR session lookup failures instead of redirecting to /login", async () => {
    mockedIsServerEnvironment.mockReturnValue(true);
    mockedGetStrictServerSession.mockRejectedValue(
      new Error("server session down")
    );

    const failure = await redirectIfOrganizationReady().catch(
      (caughtError) => caughtError
    );

    const redirectFailure = isRedirect(failure);

    expect({ redirectFailure }).toStrictEqual({ redirectFailure: false });
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("server session down");
    expect(mockedGetStrictServerOrganizations).not.toHaveBeenCalled();
  }, 1000);

  it("redirects onboarding users away when organization access is already ready", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          activeOrganizationId: "org_active",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });
    mockedGetClientOrganizations.mockResolvedValue({
      data: [{ id: "org_active", name: "Active Org", slug: "active-org" }],
      error: null,
    });

    const result = redirectIfOrganizationReady();

    await expect(result).rejects.toMatchObject({
      options: { to: "/" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
    expect(mockedSetClientActiveOrganization).not.toHaveBeenCalled();
  }, 1000);

  it("allows onboarding to continue when the active organization is stale and no memberships remain", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          activeOrganizationId: "org_stale",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });
    mockedGetClientOrganizations.mockResolvedValue({
      data: [],
      error: null,
    });

    await expect(redirectIfOrganizationReady()).resolves.toStrictEqual({
      activeOrganizationSync: {
        required: true,
        targetOrganizationId: null,
      },
    });
    expect(mockedSetClientActiveOrganization).not.toHaveBeenCalled();
  }, 1000);

  it("rethrows client-side organization lookup failures in redirectIfOrganizationReady", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {},
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });
    mockedGetClientOrganizations.mockRejectedValue(new Error("network down"));

    const failure = await redirectIfOrganizationReady().catch(
      (caughtError) => caughtError
    );

    const redirectFailure = isRedirect(failure);

    expect({ redirectFailure }).toStrictEqual({ redirectFailure: false });
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("network down");
  }, 1000);
});
