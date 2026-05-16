import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationRole } from "@ceird/identity-core";
import type { OrganizationActivityQuery } from "@ceird/jobs-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { isRedirect } from "@tanstack/react-router";

const organizationId = decodeOrganizationId("org_123");

const {
  mockedGetCurrentServerJobMemberOptions,
  mockedListAllCurrentServerSites,
  mockedListAllCurrentServerJobs,
  mockedListCurrentServerOrganizationActivity,
} = vi.hoisted(() => ({
  mockedGetCurrentServerJobMemberOptions: vi.fn<() => Promise<unknown>>(),
  mockedListAllCurrentServerSites: vi.fn<() => Promise<unknown>>(),
  mockedListAllCurrentServerJobs: vi.fn<() => Promise<unknown>>(),
  mockedListCurrentServerOrganizationActivity:
    vi.fn<(query?: OrganizationActivityQuery) => Promise<unknown>>(),
}));

vi.mock("#/features/jobs/jobs-server", () => ({
  getCurrentServerJobMemberOptions: mockedGetCurrentServerJobMemberOptions,
  listAllCurrentServerJobs: mockedListAllCurrentServerJobs,
  listCurrentServerOrganizationActivity:
    mockedListCurrentServerOrganizationActivity,
}));

vi.mock("#/features/api/app-api-server", () => ({
  listAllCurrentServerSites: mockedListAllCurrentServerSites,
}));

describe("organization home route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each<OrganizationRole>(["owner", "admin", "member"])(
    "keeps %s users on the organization home route",
    async (role) => {
      const { loadOrganizationHomeRoute } = await import("./_app._org.index");

      expect(
        loadOrganizationHomeRoute({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: role,
        })
      ).toBeUndefined();
    },
    10_000
  );

  it("redirects external users from organization home to jobs", async () => {
    const { loadOrganizationHomeRoute } = await import("./_app._org.index");
    let result: unknown;

    try {
      loadOrganizationHomeRoute({
        activeOrganizationId: organizationId,
        activeOrganizationSync: {
          required: false,
          targetOrganizationId: organizationId,
        },
        currentOrganizationRole: "external",
      });
    } catch (error) {
      result = error;
    }

    expect(result).toMatchObject({
      options: { to: "/jobs" },
    });
    expect(result).toSatisfy(isRedirect);
  }, 10_000);

  it("loads live dashboard data for internal organization users", async () => {
    mockedListAllCurrentServerJobs.mockResolvedValue({
      items: [],
      nextCursor: undefined,
    });
    mockedGetCurrentServerJobMemberOptions.mockResolvedValue({
      members: [{ id: "user_123", name: "Taylor Owner" }],
    });
    mockedListAllCurrentServerSites.mockResolvedValue({
      items: [],
      nextCursor: undefined,
    });
    mockedListCurrentServerOrganizationActivity.mockResolvedValue({
      items: [],
      nextCursor: undefined,
    });

    const { loadOrganizationHomeDashboardRouteData } =
      await import("./_app._org.index");

    await expect(
      loadOrganizationHomeDashboardRouteData({
        activeOrganizationId: organizationId,
        activeOrganizationSync: {
          required: false,
          targetOrganizationId: organizationId,
        },
        currentOrganizationRole: "owner",
      })
    ).resolves.toMatchObject({
      activity: {
        available: true,
        items: [],
      },
      jobs: {
        items: [],
      },
      members: {
        total: 1,
      },
      sites: {
        items: [],
      },
    });
    expect(mockedListAllCurrentServerJobs).toHaveBeenCalledOnce();
    expect(mockedGetCurrentServerJobMemberOptions).toHaveBeenCalledOnce();
    expect(mockedListAllCurrentServerSites).toHaveBeenCalledOnce();
    expect(mockedListCurrentServerOrganizationActivity).toHaveBeenCalledWith({
      limit: 5,
    });
  }, 10_000);
});
