import {
  clearAppContextClientCache,
  getCachedClientAppContext,
  readFreshCachedClientAppContext,
} from "./app-context-client-cache";

const { mockedGetCurrentAppContext } = vi.hoisted(() => ({
  mockedGetCurrentAppContext: vi.fn<(input?: unknown) => Promise<unknown>>(),
}));

vi.mock(import("./app-context-functions"), async (importActual) => {
  const actual = await importActual();
  const typedGetCurrentAppContext =
    mockedGetCurrentAppContext as unknown as typeof actual.getCurrentAppContext;

  return {
    ...actual,
    getCurrentAppContext: typedGetCurrentAppContext,
  };
});

const authenticatedSnapshot = {
  session: {
    session: {
      id: "session_123",
      createdAt: "2026-05-24T10:00:00.000Z",
      updatedAt: "2026-05-24T10:00:00.000Z",
      userId: "user_123",
      expiresAt: "2026-05-31T10:00:00.000Z",
      activeOrganizationId: "org_123",
    },
    user: {
      id: "user_123",
      name: "Taylor Example",
      email: "taylor@example.com",
      image: null,
      emailVerified: false,
      twoFactorEnabled: false,
      createdAt: "2026-05-24T10:00:00.000Z",
      updatedAt: "2026-05-24T10:00:00.000Z",
    },
  },
  activeOrganizationId: "org_123",
};

const organizationHydratedSnapshot = {
  ...authenticatedSnapshot,
  currentOrganizationRole: "owner",
  organizations: [
    { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
  ],
};

const unauthenticatedSnapshot = {
  session: null,
  activeOrganizationId: null,
};

describe("app context client cache", () => {
  afterEach(() => {
    clearAppContextClientCache();
    vi.clearAllMocks();
  });

  it("reuses fresh authenticated snapshots", async () => {
    mockedGetCurrentAppContext.mockResolvedValue(authenticatedSnapshot);

    await expect(getCachedClientAppContext()).resolves.toStrictEqual(
      authenticatedSnapshot
    );
    await expect(getCachedClientAppContext()).resolves.toStrictEqual(
      authenticatedSnapshot
    );
    expect(mockedGetCurrentAppContext).toHaveBeenCalledOnce();
  });

  it("keeps auth-only and organization-hydrated snapshots distinct", async () => {
    mockedGetCurrentAppContext
      .mockResolvedValueOnce(authenticatedSnapshot)
      .mockResolvedValueOnce(organizationHydratedSnapshot);

    await expect(getCachedClientAppContext()).resolves.toStrictEqual(
      authenticatedSnapshot
    );
    await expect(
      getCachedClientAppContext({ hydrateOrganizationContext: true })
    ).resolves.toStrictEqual(organizationHydratedSnapshot);
    await expect(getCachedClientAppContext()).resolves.toStrictEqual(
      organizationHydratedSnapshot
    );
    expect(mockedGetCurrentAppContext).toHaveBeenCalledTimes(2);
    expect(mockedGetCurrentAppContext).toHaveBeenNthCalledWith(1, {
      data: { hydrateOrganizationContext: false },
    });
    expect(mockedGetCurrentAppContext).toHaveBeenNthCalledWith(2, {
      data: { hydrateOrganizationContext: true },
    });
  });

  it("peeks only existing fresh snapshots without fetching", async () => {
    expect(readFreshCachedClientAppContext()).toBeUndefined();
    expect(mockedGetCurrentAppContext).not.toHaveBeenCalled();

    mockedGetCurrentAppContext.mockResolvedValue(authenticatedSnapshot);
    const cachedSnapshot = await getCachedClientAppContext();

    await expect(readFreshCachedClientAppContext()).resolves.toStrictEqual(
      cachedSnapshot
    );
    expect(mockedGetCurrentAppContext).toHaveBeenCalledOnce();
  });

  it("does not cache unauthenticated snapshots", async () => {
    mockedGetCurrentAppContext.mockResolvedValue(unauthenticatedSnapshot);

    await expect(getCachedClientAppContext()).resolves.toStrictEqual(
      unauthenticatedSnapshot
    );
    await expect(getCachedClientAppContext()).resolves.toStrictEqual(
      unauthenticatedSnapshot
    );
    expect(mockedGetCurrentAppContext).toHaveBeenCalledTimes(2);
  });

  it("clears rejected requests so later successful requests can retry", async () => {
    const error = new Error("context request failed");
    mockedGetCurrentAppContext
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(authenticatedSnapshot);

    await expect(getCachedClientAppContext()).rejects.toThrow(error);
    await expect(getCachedClientAppContext()).resolves.toStrictEqual(
      authenticatedSnapshot
    );
    expect(mockedGetCurrentAppContext).toHaveBeenCalledTimes(2);
  });
});
