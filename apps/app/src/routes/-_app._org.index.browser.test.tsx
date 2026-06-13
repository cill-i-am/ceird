import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationRole } from "@ceird/identity-core";
import type { OrganizationActivityQuery } from "@ceird/jobs-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { isRedirect } from "@tanstack/react-router";

const organizationId = decodeOrganizationId("org_123");

const {
  mockedGetCurrentServerHomeDashboardSummary,
  mockedListCurrentServerOrganizationActivity,
} = vi.hoisted(() => ({
  mockedGetCurrentServerHomeDashboardSummary: vi.fn<() => Promise<unknown>>(),
  mockedListCurrentServerOrganizationActivity:
    vi.fn<(query?: OrganizationActivityQuery) => Promise<unknown>>(),
}));

vi.mock("#/features/jobs/jobs-server", () => ({
  getCurrentServerHomeDashboardSummary:
    mockedGetCurrentServerHomeDashboardSummary,
  listCurrentServerOrganizationActivity:
    mockedListCurrentServerOrganizationActivity,
}));

describe("organization home route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each<OrganizationRole>(["owner", "admin", "member"])(
    "keeps %s users on the organization home route",
    async (role) => {
      const { loadOrganizationHomeRoute } =
        await import("#/features/auth/authenticated-home-route-loader");

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
    const { loadOrganizationHomeRoute } =
      await import("#/features/auth/authenticated-home-route-loader");
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
    mockedGetCurrentServerHomeDashboardSummary.mockResolvedValue({
      jobs: {
        items: [],
        stats: {
          activeJobs: 0,
          blockedJobs: 0,
          priorityWatchJobs: 0,
          totalJobs: 0,
          unassignedJobs: 0,
        },
      },
      members: {
        total: 1,
      },
      sites: {
        items: [],
        stats: {
          mappedSites: 0,
          totalSites: 0,
        },
      },
    });
    mockedListCurrentServerOrganizationActivity.mockResolvedValue({
      items: [],
      nextCursor: undefined,
    });

    const { loadOrganizationHomeDashboardRouteData } =
      await import("#/features/auth/authenticated-home-route-loader");

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
    expect(mockedGetCurrentServerHomeDashboardSummary).toHaveBeenCalledOnce();
    expect(mockedListCurrentServerOrganizationActivity).toHaveBeenCalledWith({
      limit: 5,
    });
  }, 10_000);
});
