import { decodeOrganizationId } from "@ceird/identity-core";
import type { UserId as UserIdType } from "@ceird/identity-core";
import type { JobListResponse, WorkItemIdType } from "@ceird/jobs-core";
import type { SiteIdType } from "@ceird/sites-core";
import { QueryClient } from "@tanstack/query-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { screen } from "@testing-library/react";
import type { ComponentProps } from "react";

import { renderAndFlushReact } from "#/test/react-render";

type AsyncLoaderMock = (...args: unknown[]) => Promise<unknown>;
const organizationId = decodeOrganizationId("org_123");
const userId = "user_123" as UserIdType;

const {
  mockedEnsureActiveOrganizationId,
  mockedGetCurrentOrganizationMemberRole,
  mockedGetCurrentServerServiceAreas,
  mockedListAllCurrentServerSites,
  mockedListAllCurrentServerJobs,
  mockedNavigate,
} = vi.hoisted(() => ({
  mockedEnsureActiveOrganizationId: vi.fn<AsyncLoaderMock>(),
  mockedGetCurrentOrganizationMemberRole: vi.fn<AsyncLoaderMock>(),
  mockedGetCurrentServerServiceAreas: vi.fn<AsyncLoaderMock>(),
  mockedListAllCurrentServerSites: vi.fn<AsyncLoaderMock>(),
  mockedListAllCurrentServerJobs: vi.fn<AsyncLoaderMock>(),
  mockedNavigate: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      to,
      ...props
    }: ComponentProps<"a"> & { to?: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    )) as typeof actual.Link,
    useNavigate: (() => mockedNavigate) as typeof actual.useNavigate,
  };
});

vi.mock("#/features/api/app-api-server", () => ({
  getCurrentServerServiceAreas: mockedGetCurrentServerServiceAreas,
  listAllCurrentServerSites: mockedListAllCurrentServerSites,
  listCurrentServerJobs: mockedListAllCurrentServerJobs,
}));

vi.mock(
  import("#/features/organizations/organization-access"),
  async (importActual) => {
    const actual = await importActual();

    return {
      ...actual,
      ensureActiveOrganizationId:
        mockedEnsureActiveOrganizationId as typeof actual.ensureActiveOrganizationId,
      getCurrentOrganizationMemberRole:
        mockedGetCurrentOrganizationMemberRole as typeof actual.getCurrentOrganizationMemberRole,
    };
  }
);

describe("sites route loader", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "loads only site options for the server-first route payload",
    { timeout: 10_000 },
    async () => {
      const siteOptions = {
        serviceAreas: [],
        sites: [],
      };

      mockedListAllCurrentServerSites.mockResolvedValue({
        items: siteOptions.sites,
        nextCursor: undefined,
      });
      mockedGetCurrentServerServiceAreas.mockResolvedValue({
        items: siteOptions.serviceAreas,
      });

      const { loadSitesRouteData } =
        await import("#/features/sites/sites-route-loader");

      await expect(
        loadSitesRouteData({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: "owner",
          currentUserId: userId,
        })
      ).resolves.toStrictEqual({
        options: {
          serviceAreas: [],
          sites: [],
        },
        viewer: {
          role: "owner",
          userId,
        },
      });
      expect(mockedEnsureActiveOrganizationId).not.toHaveBeenCalled();
      expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
      expect(mockedListAllCurrentServerSites).toHaveBeenCalledOnce();
      expect(mockedGetCurrentServerServiceAreas).toHaveBeenCalledOnce();
    }
  );

  it(
    "seeds the router query client with the scoped sites collection key",
    { timeout: 10_000 },
    async () => {
      const queryClient = new QueryClient();
      const site = {
        addressLine1: "1 Custom House Quay",
        country: "IE",
        county: "Dublin",
        eircode: "D01 X2X2",
        geocodedAt: "2026-04-27T10:00:00.000Z",
        geocodingProvider: "stub",
        id: "55555555-5555-4555-8555-555555555555" as SiteIdType,
        labels: [],
        latitude: 53.3498,
        longitude: -6.2603,
        name: "Docklands Campus",
      };

      mockedListAllCurrentServerSites.mockResolvedValue({
        items: [site],
        nextCursor: undefined,
      });
      mockedGetCurrentServerServiceAreas.mockResolvedValue({
        items: [],
      });

      const [{ organizationSitesQueryKey }, { loadSitesRouteData }] =
        await Promise.all([
          import("#/features/sites/sites-query-keys"),
          import("#/features/sites/sites-route-loader"),
        ]);

      await loadSitesRouteData({
        activeOrganizationId: organizationId,
        activeOrganizationSync: {
          required: false,
          targetOrganizationId: organizationId,
        },
        currentOrganizationRole: "owner",
        currentUserId: userId,
        queryClient,
      });

      expect(
        queryClient.getQueryData(
          organizationSitesQueryKey({
            organizationId,
            role: "owner",
            userId,
          })
        )
      ).toStrictEqual([site]);
    }
  );

  it(
    "redirects external users before fetching site options",
    { timeout: 10_000 },
    async () => {
      const [{ isRedirect }, { loadSitesRouteData }] = await Promise.all([
        import("@tanstack/react-router"),
        import("#/features/sites/sites-route-loader"),
      ]);
      const result = loadSitesRouteData({
        activeOrganizationId: organizationId,
        activeOrganizationSync: {
          required: false,
          targetOrganizationId: organizationId,
        },
        currentOrganizationRole: "external",
        currentUserId: userId,
      });

      await expect(result).rejects.toMatchObject({
        options: { to: "/jobs" },
      });
      await expect(result).rejects.toSatisfy(isRedirect);
      expect(mockedListAllCurrentServerSites).not.toHaveBeenCalled();
      expect(mockedGetCurrentServerServiceAreas).not.toHaveBeenCalled();
      expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
    }
  );

  it(
    "loads jobs related to the selected site for the detail route",
    { timeout: 10_000 },
    async () => {
      const relatedJobId =
        "77777777-7777-4777-8777-777777777777" as WorkItemIdType;
      const siteId = "55555555-5555-4555-8555-555555555555" as SiteIdType;
      const jobList: JobListResponse = {
        items: [
          {
            createdAt: "2026-04-23T10:00:00.000Z",
            id: relatedJobId,
            kind: "job",
            labels: [],
            priority: "high",
            siteId,
            status: "in_progress",
            title: "Inspect boiler",
            updatedAt: "2026-04-23T12:00:00.000Z",
          },
        ],
        nextCursor: undefined,
      };

      mockedListAllCurrentServerJobs.mockResolvedValue(jobList);

      const { loadSiteDetailRouteData } =
        await import("#/features/sites/sites-detail-route-loader");

      await expect(
        loadSiteDetailRouteData(siteId, {
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
        })
      ).resolves.toStrictEqual({
        hasMoreRelatedJobs: false,
        relatedJobs: jobList.items,
        siteId,
      });
      expect(mockedListAllCurrentServerJobs).toHaveBeenCalledWith({
        limit: 25,
        siteId,
      });
    }
  );

  it(
    "renders sites from loader-seeded provider state on the first paint",
    { timeout: 10_000 },
    async () => {
      const { SitesRouteContent } =
        await import("#/features/sites/sites-route-content");

      await renderAndFlushReact(
        <SitesRouteContent
          activeOrganizationId={organizationId}
          options={{
            serviceAreas: [],
            sites: [
              {
                addressLine1: "1 Custom House Quay",
                country: "IE",
                county: "Dublin",
                eircode: "D01 X2X2",
                geocodedAt: "2026-04-27T10:00:00.000Z",
                geocodingProvider: "stub",
                id: "55555555-5555-4555-8555-555555555555" as SiteIdType,
                labels: [],
                latitude: 53.3498,
                longitude: -6.2603,
                name: "Docklands Campus",
              },
            ],
          }}
          viewer={{
            role: "owner",
            userId,
          }}
        />
      );

      expect(
        screen.getByRole("link", { name: "Docklands Campus" })
      ).toBeInTheDocument();
    }
  );
});
