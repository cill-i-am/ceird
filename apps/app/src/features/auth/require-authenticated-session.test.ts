import { isRedirect } from "@tanstack/react-router";

import { requireAuthenticatedSession } from "./require-authenticated-session";

interface Session {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  expiresAt: Date;
  token: string;
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
  mockedGetServerAuthSession,
  mockedGetSession,
  mockedIsServerEnvironment,
} = vi.hoisted(() => ({
  mockedGetServerAuthSession:
    vi.fn<(...args: unknown[]) => Promise<AuthSession | null>>(),
  mockedGetSession: vi.fn<(...args: unknown[]) => Promise<SessionResponse>>(),
  mockedIsServerEnvironment: vi.fn<() => boolean>(),
}));

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
    vi.clearAllMocks();
  });

  it("throws a redirect to /login when no session exists", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: null,
      error: null,
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
        token: "session-token",
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
    const session: AuthSession = {
      session: {
        id: "session_234",
        createdAt: new Date("2026-04-03T12:00:00.000Z"),
        updatedAt: new Date("2026-04-03T12:00:00.000Z"),
        userId: "user_234",
        expiresAt: new Date("2026-04-10T12:00:00.000Z"),
        token: "session-token-client",
      },
      user: {
        name: "Taylor Example",
        email: "person@example.com",
        image: null,
      },
    };

    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: session,
      error: null,
    });

    await expect(requireAuthenticatedSession()).resolves.toStrictEqual(session);
    expect(mockedGetSession).toHaveBeenCalledOnce();
    expect(mockedGetServerAuthSession).not.toHaveBeenCalled();
  }, 1000);

  it("redirects to /login when session lookup throws an unexpected error", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockRejectedValue(new Error("network down"));

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
    expect(mockedGetServerAuthSession).not.toHaveBeenCalled();
  }, 1000);
});
