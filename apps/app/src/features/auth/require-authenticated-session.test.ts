import { isRedirect } from "@tanstack/react-router";

import { clearAppContextClientCache } from "./app-context-client-cache";
import { requireAuthenticatedSession } from "./require-authenticated-session";

interface Session {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  expiresAt: Date;
  token?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface User {
  name: string;
  email: string;
  image?: string | null;
}

interface AuthSession {
  session: Session;
  user: User;
}

type SessionResponse =
  | {
      data: AuthSession | null;
      error: null;
    }
  | {
      data: null;
      error: null;
    };

const {
  mockedGetCurrentAppContext,
  mockedGetServerAuthSession,
  mockedGetSession,
  mockedIsServerEnvironment,
} = vi.hoisted(() => ({
  mockedGetCurrentAppContext: vi.fn<() => Promise<unknown>>(),
  mockedGetServerAuthSession:
    vi.fn<(...args: unknown[]) => Promise<AuthSession | null>>(),
  mockedGetSession: vi.fn<(...args: unknown[]) => Promise<SessionResponse>>(),
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

describe("authenticated-session requirement", () => {
  afterEach(() => {
    clearAppContextClientCache();
    vi.clearAllMocks();
  });

  it("throws a redirect to /login when no session exists", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockResolvedValue({
      session: null,
      activeOrganizationId: null,
    });

    const result = requireAuthenticatedSession();

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

  it("resolves with the server session when one exists", async () => {
    const session: AuthSession = {
      session: {
        id: "session_123",
        createdAt: new Date("2026-04-03T12:00:00.000Z"),
        updatedAt: new Date("2026-04-03T12:00:00.000Z"),
        userId: "user_123",
        expiresAt: new Date("2026-04-10T12:00:00.000Z"),
      },
      user: {
        name: "Taylor Example",
        email: "person@example.com",
        image: null,
      },
    };

    mockedIsServerEnvironment.mockReturnValue(true);
    mockedGetServerAuthSession.mockResolvedValue(session);
    mockedGetSession.mockRejectedValue(
      new Error("Browser auth client should not run during SSR")
    );

    await expect(requireAuthenticatedSession()).resolves.toStrictEqual(session);
    expect(mockedGetServerAuthSession).toHaveBeenCalledOnce();
    expect(mockedGetSession).not.toHaveBeenCalled();
  }, 1000);

  it("resolves with the client session when one exists", async () => {
    const session = {
      session: {
        id: "session_234",
        createdAt: "2026-04-03T12:00:00.000Z",
        updatedAt: "2026-04-03T12:00:00.000Z",
        userId: "user_234",
        expiresAt: "2026-04-10T12:00:00.000Z",
      },
      user: {
        id: "user_234",
        name: "Taylor Example",
        email: "person@example.com",
        image: null,
        emailVerified: true,
        createdAt: "2026-04-03T12:00:00.000Z",
        updatedAt: "2026-04-03T12:00:00.000Z",
      },
    };

    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockResolvedValue({
      session,
      activeOrganizationId: null,
    });
    mockedGetSession.mockRejectedValue(
      new Error("Raw Better Auth session cache should not run in guards")
    );

    await expect(requireAuthenticatedSession()).resolves.toStrictEqual(session);
    expect(mockedGetCurrentAppContext).toHaveBeenCalledOnce();
    expect(mockedGetSession).not.toHaveBeenCalled();
    expect(mockedGetServerAuthSession).not.toHaveBeenCalled();
  }, 1000);

  it("reuses fresh app context lookups during protected route transitions", async () => {
    const session = {
      session: {
        id: "session_cached",
        createdAt: "2026-04-03T12:00:00.000Z",
        updatedAt: "2026-04-03T12:00:00.000Z",
        userId: "user_cached",
        expiresAt: "2026-04-10T12:00:00.000Z",
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
    };

    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockResolvedValue({
      session,
      activeOrganizationId: null,
    });
    mockedGetSession.mockRejectedValue(
      new Error("Raw Better Auth session cache should not run in guards")
    );

    await expect(requireAuthenticatedSession()).resolves.toStrictEqual(session);
    await expect(requireAuthenticatedSession()).resolves.toStrictEqual(session);
    expect(mockedGetCurrentAppContext).toHaveBeenCalledOnce();
    expect(mockedGetSession).not.toHaveBeenCalled();
  }, 1000);

  it("does not cache unauthenticated app context checks", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockResolvedValue({
      session: null,
      activeOrganizationId: null,
    });

    await expect(requireAuthenticatedSession()).rejects.toSatisfy(isRedirect);
    await expect(requireAuthenticatedSession()).rejects.toSatisfy(isRedirect);
    expect(mockedGetCurrentAppContext).toHaveBeenCalledTimes(2);
    expect(mockedGetSession).not.toHaveBeenCalled();
  }, 1000);

  it("rethrows session lookup failures instead of redirecting", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetCurrentAppContext.mockRejectedValue(new Error("network down"));

    const failure = await requireAuthenticatedSession().catch(
      (caughtError) => caughtError
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("network down");
    expect(mockedGetServerAuthSession).not.toHaveBeenCalled();
    expect(mockedGetSession).not.toHaveBeenCalled();
  }, 1000);
});
