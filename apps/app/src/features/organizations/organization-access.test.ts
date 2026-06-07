import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { isRedirect } from "@tanstack/react-router";

import {
  clearAppContextClientCache,
  getCachedClientAppContext,
} from "../auth/app-context-client-cache";
import { decodeServerAuthSession } from "../auth/app-context-types";
import {
  assertOrganizationInternalRouteContext,
  clearOrganizationAccessClientCache,
  ensureActiveOrganizationId,
  ensureActiveOrganizationIdForSession,
  listOrganizations,
  redirectIfOrganizationReady,
  requireOrganizationAdministrationAccess,
  requireOrganizationAccess,
  setActiveOrganization,
  synchronizeClientActiveOrganization,
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
    twoFactorEnabled?: boolean;
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

function createAppContextSession(input?: {
  readonly activeOrganizationId?: string | null;
  readonly id?: string;
}): Session {
  const id = input?.id ?? "session_app_context";

  return {
    session: {
      id,
      createdAt: "2026-05-24T10:00:00.000Z",
      updatedAt: "2026-05-24T10:00:00.000Z",
      userId: "user_app_context",
      expiresAt: "2026-05-31T10:00:00.000Z",
      activeOrganizationId: input?.activeOrganizationId,
    },
    user: {
      id: "user_app_context",
      name: "App Context User",
      email: "app-context@example.com",
      image: null,
      emailVerified: true,
      twoFactorEnabled: false,
      createdAt: "2026-05-24T10:00:00.000Z",
      updatedAt: "2026-05-24T10:00:00.000Z",
    },
  };
}

const {
  mockedGetCurrentAppContext,
  mockedGetGlobalStartContext,
  mockedGetStrictServerSession,
  mockedGetServerOrganizationMemberRole,
  mockedGetStrictServerOrganizations,
  mockedGetClientActiveMemberRole,
  mockedGetSession,
  mockedGetClientOrganizations,
  mockedSetClientActiveOrganization,
  mockedIsServerEnvironment,
} = vi.hoisted(() => ({
  mockedGetCurrentAppContext: vi.fn<() => Promise<unknown>>(),
  mockedGetGlobalStartContext: vi.fn<() => unknown>(),
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

vi.mock(import("@tanstack/react-start"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    getGlobalStartContext:
      mockedGetGlobalStartContext as typeof actual.getGlobalStartContext,
  };
});

vi.mock(import("../auth/app-context-functions"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    getCurrentAppContext:
      mockedGetCurrentAppContext as unknown as typeof actual.getCurrentAppContext,
  };
});

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
    mockedGetGlobalStartContext.mockImplementation(() => {
      throw new Error("No global app server context");
    });
    mockedGetCurrentAppContext.mockImplementation(async () => {
      const sessionResult = await mockedGetSession();
      const session =
        sessionResult?.data === null || sessionResult?.data === undefined
          ? null
          : {
              ...createAppContextSession({
                activeOrganizationId:
                  sessionResult.data.session.activeOrganizationId,
                id: sessionResult.data.session.id,
              }),
              session: {
                ...createAppContextSession({
                  activeOrganizationId:
                    sessionResult.data.session.activeOrganizationId,
                  id: sessionResult.data.session.id,
                }).session,
                ...sessionResult.data.session,
              },
              user: {
                ...createAppContextSession().user,
                ...sessionResult.data.user,
              },
            };

      return {
        session,
        activeOrganizationId: session?.session.activeOrganizationId ?? null,
      };
    });
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
    clearAppContextClientCache();
    clearOrganizationAccessClientCache();
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

  it("prefers request app context organizations over client organization lookups", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetGlobalStartContext.mockReturnValue({
      organizations: [
        { id: "org_context", name: "Context Org", slug: "context-org" },
      ],
    });
    mockedGetClientOrganizations.mockRejectedValue(
      new Error("Better Auth organization list should not run")
    );

    await expect(listOrganizations()).resolves.toStrictEqual([
      { id: "org_context", name: "Context Org", slug: "context-org" },
    ]);
    expect(mockedGetCurrentAppContext).not.toHaveBeenCalled();
    expect(mockedGetClientOrganizations).not.toHaveBeenCalled();
    expect(mockedGetStrictServerOrganizations).not.toHaveBeenCalled();
  }, 1000);

  it("lists organizations through Better Auth without fetching app context when no app context cache exists", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetClientOrganizations.mockResolvedValue({
      data: [{ id: "org_auth", name: "Auth Org", slug: "auth-org" }],
      error: null,
    });

    await expect(listOrganizations()).resolves.toStrictEqual([
      { id: "org_auth", name: "Auth Org", slug: "auth-org" },
    ]);
    expect(mockedGetCurrentAppContext).not.toHaveBeenCalled();
    expect(mockedGetClientOrganizations).toHaveBeenCalledOnce();
  }, 1000);

  it("prefers a fresh browser app context cache with organizations when no request context exists", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockResolvedValue({
      session: createAppContextSession({ activeOrganizationId: "org_context" }),
      activeOrganizationId: "org_context",
      organizations: [
        { id: "org_context", name: "Context Org", slug: "context-org" },
      ],
    });
    mockedGetClientOrganizations.mockRejectedValue(
      new Error("Better Auth organization list should not run")
    );

    await expect(getCachedClientAppContext()).resolves.toMatchObject({
      activeOrganizationId: "org_context",
    });
    expect(mockedGetCurrentAppContext).toHaveBeenCalledOnce();

    await expect(listOrganizations()).resolves.toStrictEqual([
      { id: "org_context", name: "Context Org", slug: "context-org" },
    ]);
    expect(mockedGetCurrentAppContext).toHaveBeenCalledOnce();
    expect(mockedGetClientOrganizations).not.toHaveBeenCalled();
  }, 1000);

  it("falls back to the Better Auth organization list when the fresh browser app context cache has no organizations", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockResolvedValue({
      session: createAppContextSession({ activeOrganizationId: "org_auth" }),
      activeOrganizationId: "org_auth",
    });
    mockedGetClientOrganizations.mockResolvedValue({
      data: [{ id: "org_auth", name: "Auth Org", slug: "auth-org" }],
      error: null,
    });

    await expect(getCachedClientAppContext()).resolves.toMatchObject({
      activeOrganizationId: "org_auth",
    });
    expect(mockedGetCurrentAppContext).toHaveBeenCalledOnce();

    await expect(listOrganizations()).resolves.toStrictEqual([
      { id: "org_auth", name: "Auth Org", slug: "auth-org" },
    ]);
    expect(mockedGetCurrentAppContext).toHaveBeenCalledOnce();
    expect(mockedGetClientOrganizations).toHaveBeenCalledOnce();
  }, 1000);

  it("uses the browser app context session for organization access checks", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockResolvedValue({
      session: createAppContextSession({ activeOrganizationId: "org_context" }),
      activeOrganizationId: "org_context",
      organizations: [
        { id: "org_context", name: "Context Org", slug: "context-org" },
      ],
    });
    mockedGetSession.mockRejectedValue(
      new Error("Raw Better Auth session cache should not run")
    );

    await expect(ensureActiveOrganizationId()).resolves.toMatchObject({
      activeOrganizationId: "org_context",
      activeOrganizationSync: {
        required: false,
        targetOrganizationId: "org_context",
      },
    });
    expect(mockedGetCurrentAppContext).toHaveBeenCalledOnce();
    expect(mockedGetSession).not.toHaveBeenCalled();
    expect(mockedGetClientOrganizations).not.toHaveBeenCalled();
  }, 1000);

  it("syncs Better Auth toward the route-resolved active organization from app context", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockResolvedValue({
      session: createAppContextSession({ activeOrganizationId: "org_123" }),
      activeOrganizationId: "org_456",
      organizations: [
        { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
        { id: "org_456", name: "Beta Field Ops", slug: "beta-field-ops" },
      ],
      requestedOrganizationSlug: "beta-field-ops",
    });
    mockedGetSession.mockRejectedValue(
      new Error("Raw Better Auth session cache should not run")
    );

    await expect(ensureActiveOrganizationId()).resolves.toMatchObject({
      activeOrganization: {
        id: "org_456",
        name: "Beta Field Ops",
        slug: "beta-field-ops",
      },
      activeOrganizationId: "org_456",
      activeOrganizationSync: {
        required: true,
        targetOrganizationId: "org_456",
      },
      session: {
        session: {
          activeOrganizationId: "org_123",
        },
      },
    });
    expect(mockedGetCurrentAppContext).toHaveBeenCalledOnce();
    expect(mockedGetSession).not.toHaveBeenCalled();
    expect(mockedGetClientOrganizations).not.toHaveBeenCalled();
    expect(mockedSetClientActiveOrganization).not.toHaveBeenCalled();
  }, 1000);

  it("does not fall back to the session organization when app context explicitly resolves no active organization", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockResolvedValue({
      session: createAppContextSession({ activeOrganizationId: "org_123" }),
      activeOrganizationId: null,
      organizations: [
        { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
      ],
      requestedOrganizationSlug: "gamma-field-ops",
    });
    mockedGetSession.mockRejectedValue(
      new Error("Raw Better Auth session cache should not run")
    );

    const result = ensureActiveOrganizationId();

    await expect(result).rejects.toMatchObject({
      options: { to: "/create-organization" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
    expect(mockedGetCurrentAppContext).toHaveBeenCalledOnce();
    expect(mockedGetSession).not.toHaveBeenCalled();
    expect(mockedGetClientOrganizations).not.toHaveBeenCalled();
    expect(mockedSetClientActiveOrganization).not.toHaveBeenCalled();
  }, 1000);

  it("sets the client active organization through Better Auth", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);

    await expect(
      setActiveOrganization(decodeOrganizationId("org_next"))
    ).resolves.toBeUndefined();

    expect(mockedSetClientActiveOrganization).toHaveBeenCalledWith({
      organizationId: "org_next",
    });
  });

  it("reuses fresh client organization access lookups during route transitions", async () => {
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
      activeOrganizationId: "org_active",
    });
    await expect(
      requireOrganizationAdministrationAccess()
    ).resolves.toMatchObject({
      activeOrganizationId: "org_active",
    });

    expect(mockedGetSession).toHaveBeenCalledOnce();
    expect(mockedGetClientOrganizations).toHaveBeenCalledOnce();
    expect(mockedGetClientActiveMemberRole).toHaveBeenCalledOnce();
  }, 1000);

  it("does not cache unauthenticated client sessions", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({ data: null, error: null });

    await expect(ensureActiveOrganizationId()).rejects.toSatisfy(isRedirect);
    await expect(ensureActiveOrganizationId()).rejects.toSatisfy(isRedirect);

    expect(mockedGetSession).toHaveBeenCalledTimes(2);
  }, 1000);

  it("clears client organization access lookups after active organization changes", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetClientOrganizations.mockResolvedValue({
      data: [{ id: "org_active", name: "Active Org", slug: "active-org" }],
      error: null,
    });

    await expect(listOrganizations()).resolves.toStrictEqual([
      { id: "org_active", name: "Active Org", slug: "active-org" },
    ]);
    await expect(
      setActiveOrganization(decodeOrganizationId("org_active"))
    ).resolves.toBeUndefined();
    await expect(listOrganizations()).resolves.toStrictEqual([
      { id: "org_active", name: "Active Org", slug: "active-org" },
    ]);

    expect(mockedGetClientOrganizations).toHaveBeenCalledTimes(2);
  }, 1000);

  it("clears the client active organization when sync targets no organization", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);

    await expect(
      synchronizeClientActiveOrganization({
        required: true,
        targetOrganizationId: null,
      })
    ).resolves.toBeUndefined();

    expect(mockedSetClientActiveOrganization).toHaveBeenCalledWith({
      organizationId: null,
    });
  });

  it("skips active organization sync when no change is required", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);

    await expect(
      synchronizeClientActiveOrganization({
        required: false,
        targetOrganizationId: null,
      })
    ).resolves.toBeUndefined();

    expect(mockedSetClientActiveOrganization).not.toHaveBeenCalled();
  });

  it("rethrows active organization switch failures", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedSetClientActiveOrganization.mockResolvedValue({
      data: null,
      error: new Error("switch failed"),
    });

    const failure = await setActiveOrganization(
      decodeOrganizationId("org_next")
    ).catch((caughtError) => caughtError);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("switch failed");
  });

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

  it("resolves organization access from an existing session without reloading the session", async () => {
    mockedIsServerEnvironment.mockReturnValue(true);
    mockedGetStrictServerOrganizations.mockResolvedValue([
      { id: serverOrganizationId, name: "Server Org", slug: "server-org" },
    ]);

    await expect(
      ensureActiveOrganizationIdForSession(
        decodeServerAuthSession({
          session: {
            activeOrganizationId: serverOrganizationId,
            createdAt: "2026-05-24T10:00:00.000Z",
            expiresAt: "2026-05-31T10:00:00.000Z",
            id: "session_server_context",
            token: "session-server-context-token",
            updatedAt: "2026-05-24T10:00:00.000Z",
            userId: "user_server",
          },
          user: {
            createdAt: "2026-05-24T10:00:00.000Z",
            email: "server@example.com",
            emailVerified: true,
            twoFactorEnabled: false,
            id: "user_server",
            image: null,
            name: "Server User",
            updatedAt: "2026-05-24T10:00:00.000Z",
          },
        })
      )
    ).resolves.toMatchObject({
      activeOrganization: {
        id: serverOrganizationId,
        name: "Server Org",
      },
      activeOrganizationId: serverOrganizationId,
      activeOrganizationSync: {
        required: false,
        targetOrganizationId: serverOrganizationId,
      },
    });
    expect(mockedGetStrictServerSession).not.toHaveBeenCalled();
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

    await expect(ensureActiveOrganizationId()).resolves.toMatchObject({
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
      organizations: [
        {
          id: "org_current",
          name: "Current Org",
          slug: "current-org",
        },
      ],
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

    await expect(ensureActiveOrganizationId()).resolves.toMatchObject({
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
      organizations: [
        {
          id: "org_first",
          name: "First Org",
          slug: "first-org",
        },
        {
          id: "org_second",
          name: "Second Org",
          slug: "second-org",
        },
      ],
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
      options: { to: "/create-organization" },
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
        ipAddress: "",
        userAgent: "curl/8.7.1",
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
        ipAddress: "",
        userAgent: "curl/8.7.1",
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
      organizations: [
        {
          id: "org_server",
          name: "Server Org",
          slug: "server-org",
        },
      ],
      session: {
        session: {
          id: "session_123",
          createdAt: "2026-04-04T17:08:12.497Z",
          updatedAt: "2026-04-04T17:08:12.497Z",
          userId: "user_123",
          expiresAt: "2026-04-11T17:08:12.497Z",
          ipAddress: "",
          userAgent: "curl/8.7.1",
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
      options: { to: "/create-organization" },
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

  it.each<OrganizationRole>(["member", "external"])(
    "redirects %s users away from organization administration routes",
    async (role) => {
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
          role,
        },
        error: null,
      });

      const result = requireOrganizationAdministrationAccess();

      await expect(result).rejects.toMatchObject({
        options: { to: "/" },
      });
      await expect(result).rejects.toSatisfy(isRedirect);
    },
    1000
  );

  it("redirects external users away from internal organization route contexts", () => {
    let result: unknown;

    try {
      assertOrganizationInternalRouteContext({
        activeOrganizationSync: {
          required: false,
          targetOrganizationId: decodeOrganizationId("org_active"),
        },
        currentOrganizationRole: "external",
      });
    } catch (error) {
      result = error;
    }

    expect(result).toMatchObject({
      options: { to: "/jobs" },
    });
    expect(result).toSatisfy(isRedirect);
  });

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

  it("allows onboarding to settle when tenant context explicitly resolves no active organization", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockResolvedValue({
      session: createAppContextSession({ activeOrganizationId: "org_123" }),
      activeOrganizationId: null,
      organizations: [
        { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
      ],
      requestedOrganizationSlug: "gamma-field-ops",
    });
    mockedGetSession.mockRejectedValue(
      new Error("Raw Better Auth session cache should not run")
    );

    await expect(redirectIfOrganizationReady()).resolves.toStrictEqual({
      activeOrganizationSync: {
        required: true,
        targetOrganizationId: null,
      },
    });
    expect(mockedGetCurrentAppContext).toHaveBeenCalledOnce();
    expect(mockedGetSession).not.toHaveBeenCalled();
    expect(mockedSetClientActiveOrganization).not.toHaveBeenCalled();
  }, 1000);

  it("redirects neutral-host onboarding users away when they have organizations", async () => {
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
        { id: "org_existing", name: "Existing Org", slug: "existing-org" },
      ],
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
