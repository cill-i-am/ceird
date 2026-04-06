import {
  getCurrentServerOrganizationSession,
  getCurrentServerOrganizations,
  listCurrentServerOrganizations,
  setCurrentServerActiveOrganization,
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
  mockedSetResponseHeader,
} = vi.hoisted(() => ({
  mockedGetRequestHeader: vi.fn<(name: string) => string | undefined>(),
  mockedGetRequestHost: vi.fn<() => string>(),
  mockedGetRequestProtocol: vi.fn<() => string>(),
  mockedSetResponseHeader:
    vi.fn<(name: string, value: string | string[]) => void>(),
}));

vi.mock(import("@tanstack/react-start/server"), () => ({
  getRequestHeader: mockedGetRequestHeader,
  getRequestHost: mockedGetRequestHost,
  getRequestProtocol: mockedGetRequestProtocol,
  setResponseHeader: mockedSetResponseHeader,
}));

describe("server organization lookup", () => {
  const originalAuthOrigin = process.env.AUTH_ORIGIN;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();

    if (originalAuthOrigin === undefined) {
      delete process.env.AUTH_ORIGIN;
    } else {
      process.env.AUTH_ORIGIN = originalAuthOrigin;
    }
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
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

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
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";
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
    delete process.env.AUTH_ORIGIN;
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
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

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
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

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
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

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

  it("preserves extra fields on strict session lookup after validation", async () => {
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
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(authSession));

    await expect(getCurrentServerOrganizationSession()).resolves.toMatchObject({
      session: {
        extraSessionField: "keep-me",
      },
      user: {
        extraUserField: "keep-me-too",
      },
    });
  }, 1000);

  it("sets the active organization and forwards auth cookies to the current response", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

    const response = Response.json(
      { id: "org_123" },
      {
        status: 200,
        headers: {
          "set-cookie":
            "better-auth.session_token=next-token; Path=/; HttpOnly",
        },
      }
    );

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    await expect(
      setCurrentServerActiveOrganization("org_123")
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("organization/set-active", "http://tt-sbx-api:4301/api/auth/"),
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          cookie: "better-auth.session_token=session-token",
        },
        body: JSON.stringify({ organizationId: "org_123" }),
      }
    );
    expect(mockedSetResponseHeader).toHaveBeenCalledWith("set-cookie", [
      "better-auth.session_token=next-token; Path=/; HttpOnly",
    ]);
  }, 1000);

  it("can clear the active organization on the server", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("null", {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      })
    );

    await expect(
      setCurrentServerActiveOrganization(null)
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("organization/set-active", "http://tt-sbx-api:4301/api/auth/"),
      expect.objectContaining({
        body: JSON.stringify({ organizationId: null }),
      })
    );
  }, 1000);

  it("returns null when strict session lookup positively resolves to no session", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(null));

    await expect(getCurrentServerOrganizationSession()).resolves.toBeNull();
  }, 1000);

  it("throws when strict session lookup responds with a non-ok status", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

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
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

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
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

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
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

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
