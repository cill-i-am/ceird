import {
  getCurrentServerOrganizationSession,
  getCurrentServerOrganizations,
  listCurrentServerOrganizations,
} from "./organization-server";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  expiresAt: string;
  token: string;
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

describe("server organization lookup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("forwards the current auth cookie to the resolved auth origin", async () => {
    const organizations: Organization[] = [
      { id: "org_123", name: "Fallback Org", slug: "fallback-org" },
    ];

    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    vi.stubGlobal("__SERVER_AUTH_ORIGIN__", "http://tt-sbx-api:4301");

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(organizations));

    await expect(listCurrentServerOrganizations()).resolves.toStrictEqual(
      organizations
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("organization/list", "http://tt-sbx-api:4301/api/auth/"),
      {
        headers: {
          accept: "application/json",
          cookie: "better-auth.session_token=session-token",
        },
      }
    );
  }, 1000);

  it("returns [] from listCurrentServerOrganizations when the request has no auth cookie", async () => {
    mockedGetRequestHeader.mockImplementation(() => "");
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    vi.stubGlobal("__SERVER_AUTH_ORIGIN__", "http://tt-sbx-api:4301");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(listCurrentServerOrganizations()).resolves.toStrictEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  }, 1000);

  it("returns [] from listCurrentServerOrganizations when auth base URL cannot be resolved", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("");
    vi.stubGlobal("__SERVER_AUTH_ORIGIN__", null);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(listCurrentServerOrganizations()).resolves.toStrictEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  }, 1000);

  it("returns [] from listCurrentServerOrganizations on non-ok responses", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    vi.stubGlobal("__SERVER_AUTH_ORIGIN__", "http://tt-sbx-api:4301");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 503, statusText: "Service Unavailable" })
    );

    await expect(listCurrentServerOrganizations()).resolves.toStrictEqual([]);
  }, 1000);

  it("returns [] from listCurrentServerOrganizations when fetch throws", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    vi.stubGlobal("__SERVER_AUTH_ORIGIN__", "http://tt-sbx-api:4301");

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(listCurrentServerOrganizations()).resolves.toStrictEqual([]);
  }, 1000);

  it("forwards the current auth cookie to the resolved auth origin for strict session lookup", async () => {
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
        activeOrganizationId: "org_123",
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

    await expect(getCurrentServerOrganizationSession()).resolves.toStrictEqual(
      authSession
    );
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

  it("returns the decoded strict session shape after validation", async () => {
    const authSession = {
      session: {
        id: "session_123",
        createdAt: "2026-04-04T17:08:12.497Z",
        updatedAt: "2026-04-04T17:08:12.497Z",
        userId: "user_123",
        expiresAt: "2026-04-11T17:08:12.497Z",
        token: "session-token",
        ipAddress: "",
        userAgent: "curl/8.7.1",
        activeOrganizationId: "org_123",
        extraSessionField: "keep-me",
      },
      user: {
        id: "user_123",
        name: "Taylor Example",
        email: "taylor@example.com",
        image: null,
        emailVerified: false,
        createdAt: "2026-04-04T17:08:12.488Z",
        updatedAt: "2026-04-04T17:08:12.488Z",
        extraUserField: "keep-me-too",
      },
    };

    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    vi.stubGlobal("__SERVER_AUTH_ORIGIN__", "http://tt-sbx-api:4301");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(authSession));

    await expect(getCurrentServerOrganizationSession()).resolves.toStrictEqual({
      session: {
        id: "session_123",
        createdAt: "2026-04-04T17:08:12.497Z",
        updatedAt: "2026-04-04T17:08:12.497Z",
        userId: "user_123",
        expiresAt: "2026-04-11T17:08:12.497Z",
        token: "session-token",
        ipAddress: "",
        userAgent: "curl/8.7.1",
        activeOrganizationId: "org_123",
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
  }, 1000);

  it("does not fall back to process.env.AUTH_ORIGIN in SSR auth requests", async () => {
    const organizations: Organization[] = [
      { id: "org_123", name: "Fallback Org", slug: "fallback-org" },
    ];

    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    vi.stubGlobal("__SERVER_AUTH_ORIGIN__", null);
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(organizations));

    await expect(listCurrentServerOrganizations()).resolves.toStrictEqual(
      organizations
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("organization/list", "http://127.0.0.1:4300/api/auth/"),
      {
        headers: {
          accept: "application/json",
          cookie: "better-auth.session_token=session-token",
        },
      }
    );
  }, 1000);

  it("returns null when strict session lookup positively resolves to no session", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    vi.stubGlobal("__SERVER_AUTH_ORIGIN__", "http://tt-sbx-api:4301");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(null));

    await expect(getCurrentServerOrganizationSession()).resolves.toBeNull();
  }, 1000);

  it("throws when strict session lookup responds with a non-ok status", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    vi.stubGlobal("__SERVER_AUTH_ORIGIN__", "http://tt-sbx-api:4301");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 503, statusText: "Service Unavailable" })
    );

    const failure = await getCurrentServerOrganizationSession().catch(
      (caughtError) => caughtError
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(
      "Session lookup failed with status 503."
    );
  }, 1000);

  it("throws when strict session lookup returns a malformed session payload", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    vi.stubGlobal("__SERVER_AUTH_ORIGIN__", "http://tt-sbx-api:4301");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        session: {
          activeOrganizationId: "org_123",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      })
    );

    const failure = await getCurrentServerOrganizationSession().catch(
      (caughtError) => caughtError
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(
      "Session lookup returned an invalid payload."
    );
  }, 1000);

  it("throws when strict organization lookup responds with a non-ok status", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    vi.stubGlobal("__SERVER_AUTH_ORIGIN__", "http://tt-sbx-api:4301");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 503, statusText: "Service Unavailable" })
    );

    const failure = await getCurrentServerOrganizations().catch(
      (caughtError) => caughtError
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(
      "Organization lookup failed with status 503."
    );
  }, 1000);

  it("throws when strict organization lookup payload is invalid", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    vi.stubGlobal("__SERVER_AUTH_ORIGIN__", "http://tt-sbx-api:4301");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));

    const failure = await getCurrentServerOrganizations().catch(
      (caughtError) => caughtError
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(
      "Organization lookup returned an invalid payload."
    );
  }, 1000);

  it("returns [] when the lenient organization list payload has invalid items", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([{ id: 123, name: "Acme", slug: "acme" }])
    );

    await expect(listCurrentServerOrganizations()).resolves.toStrictEqual([]);
  }, 1000);
});
