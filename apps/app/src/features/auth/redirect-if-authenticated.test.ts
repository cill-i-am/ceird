import { isRedirect } from "@tanstack/react-router";

import { redirectIfAuthenticated } from "./redirect-if-authenticated";

const {
  mockedGetServerAuthSession,
  mockedGetSession,
  mockedIsServerEnvironment,
} = vi.hoisted(() => ({
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
    vi.clearAllMocks();
  });

  it("throws a redirect to / when a session exists", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          id: "session_123",
        },
        user: {
          name: "Taylor Example",
          email: "person@example.com",
          image: null,
        },
      },
      error: null,
    });

    const result = redirectIfAuthenticated();

    await expect(result).rejects.toMatchObject({
      options: { to: "/" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("preserves invitation continuation for authenticated auth-page visits", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          id: "session_123",
        },
        user: {
          name: "Taylor Example",
          email: "person@example.com",
          image: null,
        },
      },
      error: null,
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
    mockedGetSession.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(redirectIfAuthenticated()).resolves.toBeUndefined();
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

  it("treats session lookup failures as unauthenticated", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockRejectedValue(new Error("network down"));

    await expect(redirectIfAuthenticated()).resolves.toBeUndefined();
  }, 1000);
});
