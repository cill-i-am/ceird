import { decodeOrganizationId, decodeUserId } from "@ceird/identity-core";
import type { SiteListResponse } from "@ceird/sites-core";

type SitesListLookupMock = () => Promise<SiteListResponse>;

const organizationId = decodeOrganizationId("org_123");

const { mockedGetCurrentUserPreferences, mockedListAllCurrentServerSites } =
  vi.hoisted(() => ({
    mockedGetCurrentUserPreferences: vi.fn<
      () => Promise<{
        preferences: {
          routeProximityLocationEnabled: boolean;
          updatedAt: string;
        };
      }>
    >(),
    mockedListAllCurrentServerSites: vi.fn<SitesListLookupMock>(),
  }));

vi.mock(import("#/features/api/app-api-server"), () => ({
  listAllCurrentServerSites: mockedListAllCurrentServerSites,
}));

vi.mock(import("#/features/settings/user-preferences-api"), () => ({
  getCurrentUserPreferences: mockedGetCurrentUserPreferences,
}));

describe("sites route loader", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps sites route data available when location preference loading fails", async () => {
    const sites = {
      items: [],
      nextCursor: undefined,
    } satisfies SiteListResponse;

    mockedListAllCurrentServerSites.mockResolvedValue(sites);
    mockedGetCurrentUserPreferences.mockRejectedValue(new Error("offline"));

    const { loadSitesRouteData } = await import("./sites-route-loader");

    await expect(
      loadSitesRouteData({
        activeOrganizationId: organizationId,
        activeOrganizationSync: {
          required: false,
          targetOrganizationId: organizationId,
        },
        currentOrganizationRole: "owner",
        currentUserId: decodeUserId("user_123"),
      })
    ).resolves.toMatchObject({
      options: { sites: [] },
      routeProximityLocationEnabled: false,
    });
  });
});
