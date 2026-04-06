import { getCurrentServerOrganizations } from "./organization-server";

interface Organization {
  id: string;
  name: string;
  slug: string;
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

    await expect(getCurrentServerOrganizations()).resolves.toStrictEqual(
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

  it("derives the auth base url from the current request when no auth origin is configured", async () => {
    const organizations: Organization[] = [
      { id: "org_456", name: "Acme", slug: "acme" },
    ];

    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:3000");
    delete process.env.AUTH_ORIGIN;

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(organizations));

    await expect(getCurrentServerOrganizations()).resolves.toStrictEqual(
      organizations
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("organization/list", "http://127.0.0.1:3001/api/auth/"),
      {
        headers: {
          accept: "application/json",
          cookie: "better-auth.session_token=session-token",
        },
      }
    );
  }, 1000);

  it("throws when the organization endpoint responds with a non-ok status", async () => {
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

  it("throws when the organization payload is invalid", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(null));

    const failure = await getCurrentServerOrganizations().catch(
      (caughtError) => caughtError
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(
      "Organization lookup returned no data."
    );
  }, 1000);

  it("throws when the organization payload is not an array", async () => {
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

  it("throws when an organization summary has invalid field types", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    mockedGetRequestProtocol.mockReturnValue("http");
    mockedGetRequestHost.mockReturnValue("127.0.0.1:4300");
    process.env.AUTH_ORIGIN = "http://tt-sbx-api:4301";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([{ id: 123, name: "Acme", slug: "acme" }])
    );

    const failure = await getCurrentServerOrganizations().catch(
      (caughtError) => caughtError
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(
      "Organization lookup returned an invalid payload."
    );
  }, 1000);
});
