/* oxlint-disable vitest/prefer-import-in-mock */
import { decodeOrganizationId } from "@task-tracker/identity-core";
import type { SiteIdType } from "@task-tracker/jobs-core";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

type AsyncLoaderMock = (...args: unknown[]) => Promise<unknown>;
const organizationId = decodeOrganizationId("org_123");

const {
  mockedEnsureActiveOrganizationId,
  mockedGetCurrentOrganizationMemberRole,
  mockedGetCurrentServerSiteOptions,
  mockedNavigate,
} = vi.hoisted(() => ({
  mockedEnsureActiveOrganizationId: vi.fn<AsyncLoaderMock>(),
  mockedGetCurrentOrganizationMemberRole: vi.fn<AsyncLoaderMock>(),
  mockedGetCurrentServerSiteOptions: vi.fn<AsyncLoaderMock>(),
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

vi.mock("#/features/jobs/jobs-server", () => ({
  getCurrentServerSiteOptions: mockedGetCurrentServerSiteOptions,
}));

vi.mock("#/features/organizations/organization-access", () => ({
  ensureActiveOrganizationId: mockedEnsureActiveOrganizationId,
  getCurrentOrganizationMemberRole: mockedGetCurrentOrganizationMemberRole,
}));

describe("sites route loader", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "loads only site options for the server-first route payload",
    { timeout: 10_000 },
    async () => {
      const siteOptions = {
        regions: [],
        sites: [],
      };

      mockedGetCurrentServerSiteOptions.mockResolvedValue(siteOptions);

      const { loadSitesRouteData } = await import("./_app._org.sites");

      await expect(
        loadSitesRouteData({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: "owner",
          currentUserId: "user_123",
        })
      ).resolves.toStrictEqual({
        options: {
          contacts: [],
          members: [],
          regions: [],
          sites: [],
        },
        viewer: {
          role: "owner",
          userId: "user_123",
        },
      });
      expect(mockedEnsureActiveOrganizationId).not.toHaveBeenCalled();
      expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
      expect(mockedGetCurrentServerSiteOptions).toHaveBeenCalledOnce();
    }
  );

  it(
    "renders sites from loader-seeded atom state on the first paint",
    { timeout: 10_000 },
    async () => {
      const { SitesRouteContent } =
        await import("#/features/sites/sites-route-content");

      render(
        <SitesRouteContent
          activeOrganizationId={organizationId}
          options={{
            contacts: [],
            members: [],
            regions: [],
            sites: [
              {
                addressLine1: "1 Custom House Quay",
                country: "IE",
                county: "Dublin",
                eircode: "D01 X2X2",
                geocodedAt: "2026-04-27T10:00:00.000Z",
                geocodingProvider: "stub",
                id: "55555555-5555-4555-8555-555555555555" as SiteIdType,
                latitude: 53.3498,
                longitude: -6.2603,
                name: "Docklands Campus",
              },
            ],
          }}
          viewer={{
            role: "owner",
            userId: "user_123",
          }}
        />
      );

      expect(screen.getByText("Docklands Campus")).toBeInTheDocument();
    }
  );
});
