interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  expiresAt: string;
  token?: string;
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
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuthSession {
  session: Session;
  user: User;
}

const { mockedGetGlobalStartContext, mockedGetRequestHeader } = vi.hoisted(
  () => ({
    mockedGetGlobalStartContext: vi.fn<() => unknown>(),
    mockedGetRequestHeader: vi.fn<(name: string) => string | undefined>(),
  })
);

vi.mock(import("@tanstack/react-start"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    getGlobalStartContext:
      mockedGetGlobalStartContext as typeof actual.getGlobalStartContext,
  };
});

describe("server session lookup", () => {
  let originalApiOrigin: string | undefined;

  beforeEach(() => {
    mockedGetGlobalStartContext.mockReset();
    mockedGetRequestHeader.mockReset();
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

  it("returns null when the incoming request has no auth cookie", async () => {
    mockedGetRequestHeader.mockImplementation(
      (): string | undefined => undefined
    );

    await expect(readCurrentServerSessionForTest()).resolves.toBeNull();
  }, 10_000);

  it("reads the current request session directly instead of routing through the server function wrapper", async () => {
    const authSession: AuthSession = {
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
        name: "Fallback User",
        email: "fallback@example.com",
        image: null,
        emailVerified: false,
        twoFactorEnabled: false,
        createdAt: "2026-04-04T17:08:12.488Z",
        updatedAt: "2026-04-04T17:08:12.488Z",
      },
    };
    const expectedSession = {
      ...authSession,
      session: {
        id: authSession.session.id,
        createdAt: authSession.session.createdAt,
        updatedAt: authSession.session.updatedAt,
        userId: authSession.session.userId,
        expiresAt: authSession.session.expiresAt,
        ipAddress: authSession.session.ipAddress,
        userAgent: authSession.session.userAgent,
      },
    };

    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(authSession));

    await expect(readCurrentServerSessionForTest()).resolves.toStrictEqual(
      expectedSession
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("get-session", "https://api.example.com/api/auth/"),
      {
        headers: {
          accept: "application/json",
          cookie: "better-auth.session_token=session-token",
        },
      }
    );
  }, 10_000);

  it("returns the cached app server context auth session without fetching", async () => {
    const authSession: AuthSession = {
      session: {
        id: "session_cached",
        createdAt: "2026-04-04T17:08:12.497Z",
        updatedAt: "2026-04-04T17:08:12.497Z",
        userId: "user_cached",
        expiresAt: "2026-04-11T17:08:12.497Z",
        ipAddress: null,
        userAgent: "start/1.0",
        activeOrganizationId: "org_cached",
      },
      user: {
        id: "user_cached",
        name: "Cached User",
        email: "cached@example.com",
        image: null,
        emailVerified: true,
        twoFactorEnabled: false,
        createdAt: "2026-04-04T17:08:12.488Z",
        updatedAt: "2026-04-04T17:08:12.488Z",
      },
    };

    mockedGetGlobalStartContext.mockReturnValue({ authSession });
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(readCurrentServerSessionForTest()).resolves.toStrictEqual(
      authSession
    );
    expect(fetchMock).not.toHaveBeenCalled();
  }, 10_000);

  it("forwards the public api host and protocol for server auth reads", async () => {
    mockedGetRequestHeader.mockImplementation((name) => {
      if (name === "cookie") {
        return "__Secure-better-auth.session_token=session-token";
      }

      if (name === "host") {
        return "127.0.0.1:4300";
      }

      if (name === "x-forwarded-host") {
        return "app.ceird.example.com";
      }

      if (name === "x-forwarded-proto") {
        return "https";
      }
    });
    process.env.API_ORIGIN = "http://127.0.0.1:3001";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(null));

    await expect(readCurrentServerSessionForTest()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("get-session", "http://127.0.0.1:3001/api/auth/"),
      {
        headers: {
          accept: "application/json",
          cookie:
            "__Secure-better-auth.session_token=session-token; better-auth.session_token=session-token",
          origin: "https://app.ceird.example.com",
          "x-forwarded-host": "api.ceird.example.com",
          "x-forwarded-proto": "https",
        },
      }
    );
  }, 10_000);

  it("throws when the auth session payload is invalid", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        session: {
          id: "session_123",
        },
      })
    );

    await expect(readCurrentServerSessionForTest()).rejects.toThrow(
      "Session lookup returned an invalid payload."
    );
  }, 10_000);

  it("throws when the auth session fetch rejects", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("network unavailable")
    );

    await expect(readCurrentServerSessionForTest()).rejects.toThrow(
      "Session lookup request failed."
    );
  }, 10_000);

  it("throws when the auth session response body is malformed JSON", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{", {
        headers: {
          "content-type": "application/json",
        },
      })
    );

    await expect(readCurrentServerSessionForTest()).rejects.toThrow(
      "Session lookup returned invalid JSON."
    );
  }, 10_000);

  it("throws when the auth session active organization id is invalid", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        session: {
          id: "session_123",
          createdAt: "2026-04-04T17:08:12.497Z",
          updatedAt: "2026-04-04T17:08:12.497Z",
          userId: "user_123",
          expiresAt: "2026-04-11T17:08:12.497Z",
          token: "session-token",
          activeOrganizationId: "",
        },
        user: {
          id: "user_123",
          name: "Fallback User",
          email: "fallback@example.com",
          image: null,
          emailVerified: false,
          twoFactorEnabled: false,
          createdAt: "2026-04-04T17:08:12.488Z",
          updatedAt: "2026-04-04T17:08:12.488Z",
        },
      })
    );

    await expect(readCurrentServerSessionForTest()).rejects.toThrow(
      "Session lookup returned an invalid payload."
    );
  }, 10_000);

  it("throws when the configured server API origin is missing", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete process.env.API_ORIGIN;
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(readCurrentServerSessionForTest()).rejects.toThrow(
      "Cannot resolve the auth base URL for session lookup."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  }, 10_000);
});

async function readCurrentServerSessionForTest() {
  const { getCurrentServerSessionDirect } =
    await import("./server-session-impl.server");

  return await getCurrentServerSessionDirect(mockedGetRequestHeader);
}
