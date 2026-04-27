import type { SiteIdType } from "@task-tracker/jobs-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

type AsyncLoaderMock = (...args: unknown[]) => Promise<unknown>;

const {
  mockedEnsureActiveOrganizationId,
  mockedGetCurrentOrganizationMemberRole,
  mockedGetCurrentServerSiteOptions,
} = vi.hoisted(() => ({
  mockedEnsureActiveOrganizationId: vi.fn<AsyncLoaderMock>(),
  mockedGetCurrentOrganizationMemberRole: vi.fn<AsyncLoaderMock>(),
  mockedGetCurrentServerSiteOptions: vi.fn<AsyncLoaderMock>(),
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

      mockedEnsureActiveOrganizationId.mockResolvedValue({
        activeOrganizationId: "org_123",
        activeOrganizationSync: {
          required: false,
          targetOrganizationId: "org_123",
        },
        session: {
          user: {
            id: "user_123",
          },
        },
      });
      mockedGetCurrentOrganizationMemberRole.mockResolvedValue({
        role: "owner",
      });
      mockedGetCurrentServerSiteOptions.mockResolvedValue(siteOptions);

      const { loadSitesRouteData } = await import("./_app._org.sites");

      await expect(loadSitesRouteData()).resolves.toStrictEqual({
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
      expect(mockedGetCurrentOrganizationMemberRole).toHaveBeenCalledWith(
        "org_123",
      );
      expect(mockedGetCurrentServerSiteOptions).toHaveBeenCalledOnce();
    },
  );

  it(
    "renders sites from loader-seeded atom state on the first paint",
    { timeout: 10_000 },
    async () => {
      const { SitesRouteContent } = await import("./_app._org.sites");

      render(
        <SitesRouteContent
          activeOrganizationId="org_123"
          options={{
            contacts: [],
            members: [],
            regions: [],
            sites: [
              {
                country: "IE",
                id: "55555555-5555-4555-8555-555555555555" as SiteIdType,
                name: "Docklands Campus",
              },
            ],
          }}
          viewer={{
            role: "owner",
            userId: "user_123",
          }}
        />,
      );

      expect(screen.getByText("Docklands Campus")).toBeInTheDocument();
    },
  );
});
