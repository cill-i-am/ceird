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

const { mockedGetRequestHeader } = vi.hoisted(() => ({
  mockedGetRequestHeader: vi.fn<(name: string) => string | undefined>(),
}));

vi.mock(import("@tanstack/react-start/server"), () => ({
  getRequestHeader: mockedGetRequestHeader,
}));

describe("server session lookup", () => {
  let originalApiOrigin: string | undefined;

  beforeEach(() => {
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
    process.env.API_ORIGIN = "http://tt-sbx-api:4301";

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

  it("forwards the public api host and protocol for server auth reads", async () => {
    mockedGetRequestHeader.mockImplementation((name) => {
      if (name === "cookie") {
        return "__Secure-better-auth.session_token=session-token";
      }

      if (name === "host") {
        return "linear-ui-refresh.app.task-tracker.localhost:1355";
      }

      if (name === "x-forwarded-proto") {
        return "https";
      }
    });
    process.env.API_ORIGIN = "http://127.0.0.1:3001";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(null));

    await expect(getCurrentServerSession()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("get-session", "http://127.0.0.1:3001/api/auth/"),
      {
        headers: {
          accept: "application/json",
          cookie:
            "__Secure-better-auth.session_token=session-token; better-auth.session_token=session-token",
          "x-forwarded-host":
            "linear-ui-refresh.api.task-tracker.localhost:1355",
          "x-forwarded-proto": "https",
        },
      }
    );
  }, 1000);

  it("fails closed when the configured server API origin is missing", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete process.env.API_ORIGIN;
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(getCurrentServerSession()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  }, 1000);
});
