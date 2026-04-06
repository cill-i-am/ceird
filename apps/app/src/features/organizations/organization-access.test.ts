import { isRedirect } from "@tanstack/react-router";

import {
  redirectIfOrganizationReady,
  requireOrganizationAccess,
} from "./organization-access";

interface Session {
  session: {
    activeOrganizationId?: string | null;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface Organization {
  id: string;
  name: string;
}

const {
  mockedGetServerSession,
  mockedGetServerOrganizations,
  mockedGetSession,
  mockedGetClientOrganizations,
  mockedIsServerEnvironment,
} = vi.hoisted(() => ({
  mockedGetServerSession: vi.fn<() => Promise<Session | null>>(),
  mockedGetServerOrganizations: vi.fn<() => Promise<Organization[] | null>>(),
  mockedGetSession:
    vi.fn<() => Promise<{ data: Session | null; error: null }>>(),
  mockedGetClientOrganizations:
    vi.fn<() => Promise<{ data: Organization[] | null; error: null }>>(),
  mockedIsServerEnvironment: vi.fn<() => boolean>(),
}));

vi.mock(import("../auth/server-session"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    getCurrentServerSession:
      mockedGetServerSession as typeof actual.getCurrentServerSession,
  };
});

vi.mock(import("./organization-server"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    getCurrentServerOrganizations:
      mockedGetServerOrganizations as typeof actual.getCurrentServerOrganizations,
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
        list: mockedGetClientOrganizations as unknown as typeof actual.authClient.organization.list,
      },
    },
  };
});

describe("organization access helpers", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

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
    expect(mockedGetClientOrganizations).toHaveBeenCalledOnce();
  }, 1000);

  it("allows users with an active organization to pass through", async () => {
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

    await expect(requireOrganizationAccess()).resolves.toMatchObject({
      organizationId: "org_active",
    });
    expect(mockedGetClientOrganizations).not.toHaveBeenCalled();
  }, 1000);

  it("uses the first organization as access context when no active organization exists", async () => {
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
        { id: "org_first", name: "First Org" },
        { id: "org_second", name: "Second Org" },
      ],
      error: null,
    });

    await expect(requireOrganizationAccess()).resolves.toMatchObject({
      organizationId: "org_first",
    });
    expect(mockedGetClientOrganizations).toHaveBeenCalledOnce();
  }, 1000);

  it("redirects to /login when organization lookup fails unexpectedly during access checks", async () => {
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

    const result = requireOrganizationAccess();

    await expect(result).rejects.toMatchObject({
      options: { to: "/login" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("redirects onboarding users away from /create-organization when org access is ready", async () => {
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

    const result = redirectIfOrganizationReady();

    await expect(result).rejects.toMatchObject({
      options: { to: "/" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("redirects to /login instead of allowing onboarding when organization lookup fails", async () => {
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

    const result = redirectIfOrganizationReady();

    await expect(result).rejects.toMatchObject({
      options: { to: "/login" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("uses the server organization listing path during SSR", async () => {
    mockedIsServerEnvironment.mockReturnValue(true);
    mockedGetServerSession.mockResolvedValue({
      session: {},
      user: {
        id: "user_123",
        name: "Taylor Example",
        email: "taylor@example.com",
      },
    });
    mockedGetServerOrganizations.mockResolvedValue([
      { id: "org_server", name: "Server Org" },
    ]);

    await expect(requireOrganizationAccess()).resolves.toMatchObject({
      organizationId: "org_server",
    });
    expect(mockedGetServerOrganizations).toHaveBeenCalledOnce();
    expect(mockedGetClientOrganizations).not.toHaveBeenCalled();
  }, 1000);

  it("redirects to /login during SSR when organization lookup fails", async () => {
    mockedIsServerEnvironment.mockReturnValue(true);
    mockedGetServerSession.mockResolvedValue({
      session: {},
      user: {
        id: "user_123",
        name: "Taylor Example",
        email: "taylor@example.com",
      },
    });
    mockedGetServerOrganizations.mockRejectedValue(
      new Error("upstream unavailable")
    );

    const result = requireOrganizationAccess();

    await expect(result).rejects.toMatchObject({
      options: { to: "/login" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
    expect(mockedGetClientOrganizations).not.toHaveBeenCalled();
  }, 1000);
});
