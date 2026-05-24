import { isRedirect } from "@tanstack/react-router";

import { clearAppContextClientCache } from "./app-context-client-cache";
import { redirectIfAuthenticated } from "./redirect-if-authenticated";

const {
  mockedGetCurrentAppContext,
  mockedGetServerAuthSession,
  mockedGetSession,
  mockedIsServerEnvironment,
} = vi.hoisted(() => ({
  mockedGetCurrentAppContext: vi.fn<() => Promise<unknown>>(),
  mockedGetServerAuthSession: vi.fn<
    (...args: unknown[]) => Promise<{
      session: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        expiresAt: Date;
        token: string;
        ipAddress?: string | null;
        userAgent?: string | null;
      };
      user: {
        name: string;
        email: string;
        image?: string | null;
      };
    } | null>
  >(),
  mockedGetSession: vi.fn<
    (...args: unknown[]) => Promise<{
      data: {
        session: {
          id: string;
        };
        user: {
          name: string;
          email: string;
          image?: string | null;
        };
      } | null;
      error: null;
    }>
  >(),
  mockedIsServerEnvironment: vi.fn<() => boolean>(),
}));

vi.mock(import("./app-context-functions"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    getCurrentAppContext:
      mockedGetCurrentAppContext as unknown as typeof actual.getCurrentAppContext,
  };
});

vi.mock(import("./server-session"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    getCurrentServerSession:
      mockedGetServerAuthSession as typeof actual.getCurrentServerSession,
  };
});

vi.mock(import("./runtime-environment"), () => ({
  isServerEnvironment: mockedIsServerEnvironment,
}));

vi.mock(import("#/lib/auth-client"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    authClient: {
      ...actual.authClient,
      getSession: mockedGetSession as typeof actual.authClient.getSession,
    },
  };
});

describe("auth route redirect guard", () => {
  afterEach(() => {
    clearAppContextClientCache();
    vi.clearAllMocks();
  });

  it("throws a redirect to / when a session exists", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockResolvedValue({
      session: {
        session: {
          id: "session_123",
          createdAt: "2026-04-03T12:00:00.000Z",
          updatedAt: "2026-04-03T12:00:00.000Z",
          userId: "user_123",
          expiresAt: "2026-04-10T12:00:00.000Z",
          token: "session-token",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "person@example.com",
          image: null,
          emailVerified: true,
          createdAt: "2026-04-03T12:00:00.000Z",
          updatedAt: "2026-04-03T12:00:00.000Z",
        },
      },
      activeOrganizationId: null,
    });
    mockedGetSession.mockRejectedValue(
      new Error("Raw Better Auth session cache should not run in guards")
    );

    const result = redirectIfAuthenticated();

    await expect(result).rejects.toMatchObject({
      options: { to: "/" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
    expect(mockedGetCurrentAppContext).toHaveBeenCalledOnce();
    expect(mockedGetSession).not.toHaveBeenCalled();
  }, 1000);

  it("preserves invitation continuation for authenticated auth-page visits", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockResolvedValue({
      session: {
        session: {
          id: "session_123",
          createdAt: "2026-04-03T12:00:00.000Z",
          updatedAt: "2026-04-03T12:00:00.000Z",
          userId: "user_123",
          expiresAt: "2026-04-10T12:00:00.000Z",
          token: "session-token",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "person@example.com",
          image: null,
          emailVerified: true,
          createdAt: "2026-04-03T12:00:00.000Z",
          updatedAt: "2026-04-03T12:00:00.000Z",
        },
      },
      activeOrganizationId: null,
    });

    const result = redirectIfAuthenticated({
      invitation: "inv_123",
    });

    await expect(result).rejects.toMatchObject({
      options: {
        params: {
          invitationId: "inv_123",
        },
        to: "/accept-invitation/$invitationId",
      },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("resolves without throwing when no session exists", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockResolvedValue({
      session: null,
      activeOrganizationId: null,
    });

    await expect(redirectIfAuthenticated()).resolves.toBeUndefined();
    expect(mockedGetSession).not.toHaveBeenCalled();
  }, 1000);

  it("reuses fresh authenticated app context lookups", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockResolvedValue({
      session: {
        session: {
          id: "session_cached",
          createdAt: "2026-04-03T12:00:00.000Z",
          updatedAt: "2026-04-03T12:00:00.000Z",
          userId: "user_cached",
          expiresAt: "2026-04-10T12:00:00.000Z",
          token: "session-token",
        },
        user: {
          id: "user_cached",
          name: "Taylor Example",
          email: "person@example.com",
          image: null,
          emailVerified: true,
          createdAt: "2026-04-03T12:00:00.000Z",
          updatedAt: "2026-04-03T12:00:00.000Z",
        },
      },
      activeOrganizationId: null,
    });
    mockedGetSession.mockRejectedValue(
      new Error("Raw Better Auth session cache should not run in guards")
    );

    await expect(redirectIfAuthenticated()).rejects.toSatisfy(isRedirect);
    await expect(redirectIfAuthenticated()).rejects.toSatisfy(isRedirect);
    expect(mockedGetCurrentAppContext).toHaveBeenCalledOnce();
    expect(mockedGetSession).not.toHaveBeenCalled();
  }, 1000);

  it("does not cache unauthenticated app context checks", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockResolvedValue({
      session: null,
      activeOrganizationId: null,
    });

    await expect(redirectIfAuthenticated()).resolves.toBeUndefined();
    await expect(redirectIfAuthenticated()).resolves.toBeUndefined();
    expect(mockedGetCurrentAppContext).toHaveBeenCalledTimes(2);
    expect(mockedGetSession).not.toHaveBeenCalled();
  }, 1000);

  it("uses the server session check during SSR", async () => {
    mockedIsServerEnvironment.mockReturnValue(true);
    mockedGetServerAuthSession.mockResolvedValue({
      session: {
        id: "session_456",
        createdAt: new Date("2026-04-03T12:00:00.000Z"),
        updatedAt: new Date("2026-04-03T12:00:00.000Z"),
        userId: "user_123",
        expiresAt: new Date("2026-04-10T12:00:00.000Z"),
        token: "session-token",
      },
      user: {
        name: "Taylor Example",
        email: "person@example.com",
        image: null,
      },
    });
    mockedGetSession.mockRejectedValue(
      new Error("Browser auth client should not run during SSR")
    );

    const result = redirectIfAuthenticated();

    await expect(result).rejects.toMatchObject({
      options: { to: "/" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
    expect(mockedGetServerAuthSession).toHaveBeenCalledOnce();
    expect(mockedGetSession).not.toHaveBeenCalled();
  }, 1000);

  it("rethrows session lookup failures instead of treating them as unauthenticated", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockRejectedValue(new Error("network down"));

    const failure = await redirectIfAuthenticated().catch(
      (caughtError) => caughtError
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("network down");
    expect(mockedGetSession).not.toHaveBeenCalled();
  }, 1000);
});
