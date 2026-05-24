import { decodeOrganizationId } from "@ceird/identity-core";

import {
  createCurrentServerOrganizationDirect,
  getCurrentServerOrganizationMemberRoleDirect as getCurrentServerOrganizationMemberRole,
  getCurrentServerOrganizationSessionDirect as getCurrentServerOrganizationSession,
  getCurrentServerOrganizationsDirect as getCurrentServerOrganizations,
  setCurrentServerActiveOrganizationDirect as setCurrentServerActiveOrganization,
} from "./organization-server-impl.server";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

const organizationId = decodeOrganizationId("org_123");

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

function createAuthSession(overrides: Partial<Session> = {}): AuthSession {
  return {
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
      ...overrides,
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
}

interface MockServerFnBuilder {
  handler: ReturnType<typeof vi.fn<() => MockServerFn>>;
  inputValidator: ReturnType<typeof vi.fn<() => MockServerFnBuilder>>;
  middleware: ReturnType<
    typeof vi.fn<(middlewares: readonly unknown[]) => MockServerFnBuilder>
  >;
}

type MockServerFn = ReturnType<typeof vi.fn<() => void>>;

function readMockServerFnBuilder(reference: {
  readonly current?: MockServerFnBuilder;
}) {
  if (reference.current === undefined) {
    throw new Error("Mock server function builder was read before assignment.");
  }

  return reference.current;
}

const {
  capturedCreateServerFns,
  mockedCreateServerFn,
  mockedGetGlobalStartContext,
  mockedGetRequestHeader,
  mockedSetResponseHeader,
} = vi.hoisted(() => ({
  capturedCreateServerFns: [] as {
    middlewareCalls: (readonly unknown[])[];
    options: { method: string };
  }[],
  mockedCreateServerFn: vi.fn<
    (options: { method: string }) => MockServerFnBuilder
  >((options) => {
    const record = {
      middlewareCalls: [] as (readonly unknown[])[],
      options,
    };
    capturedCreateServerFns.push(record);

    const serverFunction = vi.fn<() => void>();
    const builderReference: { current?: MockServerFnBuilder } = {};
    const builder = Object.assign(serverFunction, {
      handler: vi.fn<() => MockServerFn>(() => serverFunction),
      inputValidator: vi.fn<() => MockServerFnBuilder>(() =>
        readMockServerFnBuilder(builderReference)
      ),
      middleware: vi.fn<
        (middlewares: readonly unknown[]) => MockServerFnBuilder
      >((middlewares) => {
        record.middlewareCalls.push(middlewares);
        return readMockServerFnBuilder(builderReference);
      }),
    });
    builderReference.current = builder;

    return builder;
  }),
  mockedGetGlobalStartContext: vi.fn<() => unknown>(),
  mockedGetRequestHeader: vi.fn<(name: string) => string | undefined>(),
  mockedSetResponseHeader:
    vi.fn<(name: string, value: string | string[]) => void>(),
}));

vi.mock(import("@tanstack/react-start"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    createServerFn:
      mockedCreateServerFn as unknown as typeof actual.createServerFn,
    getGlobalStartContext:
      mockedGetGlobalStartContext as typeof actual.getGlobalStartContext,
  };
});

vi.mock(import("@tanstack/react-start/server"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    getRequestHeader: mockedGetRequestHeader as typeof actual.getRequestHeader,
    setResponseHeader:
      mockedSetResponseHeader as typeof actual.setResponseHeader,
  };
});

describe("server organization function middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    capturedCreateServerFns.length = 0;
  });

  it("protects organization server functions with the expected middleware", async () => {
    const {
      createCurrentServerOrganization,
      setCurrentServerActiveOrganization:
        setCurrentServerActiveOrganizationServerFn,
    } = await import("./organization-server");
    const { organizationFunctionMiddleware, requiredAuthFunctionMiddleware } =
      await import("../auth/app-context-middleware");

    expect(createCurrentServerOrganization).toStrictEqual(expect.any(Function));
    expect(setCurrentServerActiveOrganizationServerFn).toStrictEqual(
      expect.any(Function)
    );
    expect(capturedCreateServerFns[0]?.middlewareCalls).toContainEqual([
      requiredAuthFunctionMiddleware,
    ]);
    expect(capturedCreateServerFns[4]?.middlewareCalls).toContainEqual([
      organizationFunctionMiddleware,
    ]);
  });
});

describe("server organization lookup", () => {
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

  it("forwards the current auth cookie when listing organizations", async () => {
    const organizations: Organization[] = [
      { id: "org_123", name: "Fallback Org", slug: "fallback-org" },
    ];

    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(organizations));

    await expect(getCurrentServerOrganizations()).resolves.toStrictEqual(
      organizations
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("organization/list", "https://api.example.com/api/auth/"),
      {
        headers: {
          accept: "application/json",
          cookie: "better-auth.session_token=session-token",
        },
      }
    );
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
    process.env.API_ORIGIN = "https://api.example.com";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(authSession));

    await expect(getCurrentServerOrganizationSession()).resolves.toStrictEqual(
      authSession
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
    process.env.API_ORIGIN = "https://api.example.com";

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

  it("returns null when strict session lookup positively resolves to no session", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(null));

    await expect(getCurrentServerOrganizationSession()).resolves.toBeNull();
  }, 1000);

  it("throws when strict session lookup responds with a non-ok status", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

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
    process.env.API_ORIGIN = "https://api.example.com";

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

  it("throws when strict session lookup returns an empty session token", async () => {
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
          token: "",
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
    process.env.API_ORIGIN = "https://api.example.com";

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
    process.env.API_ORIGIN = "https://api.example.com";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));

    const failure = await getCurrentServerOrganizations().catch(
      (caughtError) => caughtError
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(
      "Organization lookup returned an invalid payload."
    );
  }, 1000);

  it("posts the current auth cookie when syncing the active organization on the server", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ id: "org_123" }));

    await expect(
      setCurrentServerActiveOrganization(organizationId)
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("organization/set-active", "https://api.example.com/api/auth/"),
      {
        body: JSON.stringify({ organizationId: "org_123" }),
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          cookie: "better-auth.session_token=session-token",
        },
        method: "POST",
      }
    );
  }, 1000);

  it("reads the organization member role with the organization id query parameter", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ role: "owner" }));

    await expect(
      getCurrentServerOrganizationMemberRole(organizationId)
    ).resolves.toStrictEqual({ role: "owner" });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "organization/get-active-member-role?organizationId=org_123",
        "https://api.example.com/api/auth/"
      ),
      {
        headers: {
          accept: "application/json",
          cookie: "better-auth.session_token=session-token",
        },
      }
    );
  }, 1000);

  it("returns the cached organization member role when it matches the active organization", async () => {
    mockedGetGlobalStartContext.mockReturnValue({
      authSession: createAuthSession(),
      currentOrganizationRole: "admin",
    });
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      getCurrentServerOrganizationMemberRole(organizationId)
    ).resolves.toStrictEqual({ role: "admin" });
    expect(fetchMock).not.toHaveBeenCalled();
  }, 1000);

  it("creates an organization with a server-generated slug", async () => {
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

      if (name === "origin") {
        return "https://app.ceird.example.com";
      }
    });
    process.env.API_ORIGIN = "https://api.example.com";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
          {
            headers: {
              "set-cookie": "better-auth.session_token=next-session",
            },
          }
        )
      )
      .mockResolvedValueOnce(
        Response.json(
          {},
          {
            headers: {
              "set-cookie": "better-auth.session_token=active-session",
            },
          }
        )
      );

    await expect(
      createCurrentServerOrganizationDirect({ name: "Acme Field Ops" })
    ).resolves.toStrictEqual({
      id: "org_123",
      name: "Acme Field Ops",
      slug: "acme-field-ops",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("organization/create", "https://api.example.com/api/auth/"),
      {
        body: JSON.stringify({
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }),
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          cookie: "__Secure-better-auth.session_token=session-token",
          origin: "https://app.ceird.example.com",
          "x-forwarded-host": "api.ceird.example.com",
          "x-forwarded-proto": "https",
        },
        method: "POST",
      }
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("organization/set-active", "https://api.example.com/api/auth/"),
      {
        body: JSON.stringify({ organizationId: "org_123" }),
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          cookie: "__Secure-better-auth.session_token=session-token",
          origin: "https://app.ceird.example.com",
          "x-forwarded-host": "api.ceird.example.com",
          "x-forwarded-proto": "https",
        },
        method: "POST",
      }
    );
    expect(mockedSetResponseHeader).toHaveBeenCalledWith("set-cookie", [
      "better-auth.session_token=next-session",
      "better-auth.session_token=active-session",
    ]);
  }, 1000);

  it("preserves an untrusted incoming origin when creating an organization", async () => {
    mockedGetRequestHeader.mockImplementation((name) => {
      if (name === "cookie") {
        return "better-auth.session_token=session-token";
      }

      if (name === "host") {
        return "app.ceird.example.com";
      }

      if (name === "origin") {
        return "https://attacker.example";
      }
    });
    process.env.API_ORIGIN = "https://api.example.com";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "org_123",
        name: "Acme Field Ops",
        slug: "acme-field-ops",
      })
    );

    await createCurrentServerOrganizationDirect({ name: "Acme Field Ops" });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("organization/create", "https://api.example.com/api/auth/"),
      expect.objectContaining({
        headers: expect.objectContaining({
          origin: "https://attacker.example",
          "x-forwarded-host": "api.ceird.example.com",
          "x-forwarded-proto": "https",
        }),
      })
    );
  }, 1000);

  it("retries organization creation with a slug suffix when the base slug is taken", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          {
            code: "ORGANIZATION_ALREADY_EXISTS",
            message: "Organization already exists",
          },
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "org_123",
          name: "Acme Field Ops",
          slug: "acme-field-ops-retry",
        })
      );

    await expect(
      createCurrentServerOrganizationDirect({ name: "Acme Field Ops" })
    ).resolves.toStrictEqual({
      id: "org_123",
      name: "Acme Field Ops",
      slug: "acme-field-ops-retry",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({
        name: "Acme Field Ops",
        slug: "acme-field-ops",
      }),
    });
    expect(String(fetchMock.mock.calls[1]?.[1]?.body)).toMatch(
      /"slug":"acme-field-ops-[a-z0-9-]+"/
    );
  }, 1000);

  it("reports the retry status when organization slug conflict recovery fails", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          {
            code: "ORGANIZATION_ALREADY_EXISTS",
            message: "Organization already exists",
          },
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            code: "INTERNAL_SERVER_ERROR",
            message: "Organization create unavailable",
          },
          { status: 503 }
        )
      );

    await expect(
      createCurrentServerOrganizationDirect({ name: "Acme Field Ops" })
    ).rejects.toThrow("Organization creation failed with status 503.");
  }, 1000);

  it("does not retry organization creation for generic validation failures", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        {
          code: "BAD_REQUEST",
          message: "Invalid organization name",
        },
        { status: 400 }
      )
    );

    await expect(
      createCurrentServerOrganizationDirect({ name: "Acme Field Ops" })
    ).rejects.toThrow("Organization creation failed with status 400.");

    expect(fetchMock).toHaveBeenCalledOnce();
  }, 1000);
});
