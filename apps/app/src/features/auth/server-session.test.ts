import { getCurrentServerSession } from "./server-session";

interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  expiresAt: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuthSession {
  session: Session;
  user: User;
}

const {
  mockedGetRequestHeader,
  mockedGetRequestHost,
  mockedGetRequestProtocol,
} = vi.hoisted(() => ({
  mockedGetRequestHeader: vi.fn<(name: string) => string | undefined>(),
  mockedGetRequestHost: vi.fn<() => string>(),
  mockedGetRequestProtocol: vi.fn<() => string>(),
}));

vi.mock(import("@tanstack/react-start/server"), () => ({
  getRequestHeader: mockedGetRequestHeader,
  getRequestHost: mockedGetRequestHost,
  getRequestProtocol: mockedGetRequestProtocol,
}));

describe("server session lookup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns null when the incoming request has no auth cookie", async () => {
    mockedGetRequestHeader.mockImplementation(
      (): string | undefined => undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");

    await expect(getCurrentServerSession()).resolves.toBeNull();
  }, 1000);

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
        createdAt: "2026-04-04T17:08:12.488Z",
        updatedAt: "2026-04-04T17:08:12.488Z",
      },
    };

    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    vi.stubGlobal("__SERVER_AUTH_ORIGIN__", "http://tt-sbx-api:4301");

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(authSession));

    await expect(getCurrentServerSession()).resolves.toStrictEqual(authSession);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("get-session", "http://tt-sbx-api:4301/api/auth/"),
      {
        headers: {
          accept: "application/json",
          cookie: "better-auth.session_token=session-token",
        },
      }
    );
  }, 1000);

  it("does not fall back to process.env.AUTH_ORIGIN for session lookup", async () => {
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
        createdAt: "2026-04-04T17:08:12.488Z",
        updatedAt: "2026-04-04T17:08:12.488Z",
      },
    };

    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    vi.stubGlobal("__SERVER_AUTH_ORIGIN__", null);
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(authSession));

    await expect(getCurrentServerSession()).resolves.toStrictEqual(authSession);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("get-session", "http://127.0.0.1:4300/api/auth/"),
      {
        headers: {
          accept: "application/json",
          cookie: "better-auth.session_token=session-token",
        },
      }
    );
  }, 1000);
});
