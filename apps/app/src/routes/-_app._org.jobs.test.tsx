import { decodeOrganizationId } from "@ceird/identity-core";
import type {
  CommentIdType,
  ContactIdType,
  JobDetailResponse,
  UserIdType,
  WorkItemIdType,
} from "@ceird/jobs-core";
import type { ServiceAreaIdType, SiteIdType } from "@ceird/sites-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

type AsyncLoaderMock = (...args: unknown[]) => Promise<unknown>;
const organizationId = decodeOrganizationId("org_123");
const switchedOrganizationId = decodeOrganizationId("org_next");
const userId = "user_123" as UserIdType;
const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
const siteId = "33333333-3333-4333-8333-333333333333" as SiteIdType;
const contactId = "44444444-4444-4444-8444-444444444444" as ContactIdType;
const serviceAreaId =
  "55555555-5555-4555-8555-555555555555" as ServiceAreaIdType;

const {
  mockedEnsureActiveOrganizationId,
  mockedGetCurrentOrganizationMemberRole,
  mockedGetCurrentServerJobDetail,
  mockedGetCurrentServerJobOptions,
  mockedListAllCurrentServerJobs,
} = vi.hoisted(() => ({
  mockedEnsureActiveOrganizationId: vi.fn<AsyncLoaderMock>(),
  mockedGetCurrentOrganizationMemberRole: vi.fn<AsyncLoaderMock>(),
  mockedGetCurrentServerJobDetail: vi.fn<AsyncLoaderMock>(),
  mockedGetCurrentServerJobOptions: vi.fn<AsyncLoaderMock>(),
  mockedListAllCurrentServerJobs: vi.fn<AsyncLoaderMock>(),
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
  getCurrentServerJobDetail: mockedGetCurrentServerJobDetail,
  getCurrentServerJobOptions: mockedGetCurrentServerJobOptions,
  listAllCurrentServerJobs: mockedListAllCurrentServerJobs,
}));

vi.mock("#/features/organizations/organization-access", () => ({
  ensureActiveOrganizationId: mockedEnsureActiveOrganizationId,
  getCurrentOrganizationMemberRole: mockedGetCurrentOrganizationMemberRole,
}));

describe("jobs route loader", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "loads the jobs list and job options for the server-first route payload",
    {
      timeout: 10_000,
    },
    async () => {
      const list = {
        items: [],
        nextCursor: undefined,
      };
      const options = {
        contacts: [],
        labels: [],
        members: [],
        serviceAreas: [],
        sites: [],
      };

      mockedListAllCurrentServerJobs.mockResolvedValue(list);
      mockedGetCurrentServerJobOptions.mockResolvedValue(options);
      const { loadJobsRouteData } = await import("./_app._org.jobs");

      await expect(
        loadJobsRouteData({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: "owner",
          currentUserId: userId,
        })
      ).resolves.toStrictEqual({
        list,
        options,
        viewer: {
          role: "owner",
          userId,
        },
      });
      expect(mockedEnsureActiveOrganizationId).not.toHaveBeenCalled();
      expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
      expect(mockedListAllCurrentServerJobs).toHaveBeenCalledWith({});
      expect(mockedGetCurrentServerJobOptions).toHaveBeenCalledOnce();
    }
  );

  it(
    "short-circuits loader-side jobs fetches while active organization sync is pending",
    {
      timeout: 10_000,
    },
    async () => {
      const { loadJobsRouteData } = await import("./_app._org.jobs");

      await expect(
        loadJobsRouteData({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: true,
            targetOrganizationId: organizationId,
          },
          currentUserId: userId,
        })
      ).resolves.toStrictEqual({
        list: {
          items: [],
          nextCursor: undefined,
        },
        options: {
          contacts: [],
          labels: [],
          members: [],
          serviceAreas: [],
          sites: [],
        },
        viewer: {
          role: "member",
          userId,
        },
      });
      expect(mockedListAllCurrentServerJobs).not.toHaveBeenCalled();
      expect(mockedGetCurrentServerJobOptions).not.toHaveBeenCalled();
      expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
    }
  );

  it(
    "skips internal job options for external collaborators",
    {
      timeout: 10_000,
    },
    async () => {
      const list = {
        items: [],
        nextCursor: undefined,
      };

      mockedListAllCurrentServerJobs.mockResolvedValue(list);
      const { loadJobsRouteData } = await import("./_app._org.jobs");

      await expect(
        loadJobsRouteData({
          activeOrganizationId: switchedOrganizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: switchedOrganizationId,
          },
          currentOrganizationRole: "external",
          currentUserId: userId,
        })
      ).resolves.toStrictEqual({
        list,
        options: {
          contacts: [],
          labels: [],
          members: [],
          serviceAreas: [],
          sites: [],
        },
        viewer: {
          role: "external",
          userId,
        },
      });
      expect(mockedListAllCurrentServerJobs).toHaveBeenCalledWith({});
      expect(mockedGetCurrentServerJobOptions).not.toHaveBeenCalled();
    }
  );

  it(
    "keeps jobs available after switching to an external organization",
    {
      timeout: 10_000,
    },
    async () => {
      const list = {
        items: [],
        nextCursor: undefined,
      };

      mockedListAllCurrentServerJobs.mockResolvedValue(list);
      const { loadJobsRouteData } = await import("./_app._org.jobs");

      await expect(
        loadJobsRouteData({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: "external",
          currentUserId: userId,
        })
      ).resolves.toMatchObject({
        list,
        options: {
          contacts: [],
          labels: [],
          members: [],
          serviceAreas: [],
          sites: [],
        },
        viewer: {
          role: "external",
          userId,
        },
      });
      expect(mockedGetCurrentServerJobOptions).not.toHaveBeenCalled();
    }
  );

  it(
    "hydrates granted job site context for external collaborators without organization-wide options",
    {
      timeout: 10_000,
    },
    async () => {
      const list = {
        items: [
          {
            createdAt: "2026-04-23T11:00:00.000Z",
            id: workItemId,
            kind: "job" as const,
            labels: [],
            priority: "none" as const,
            siteId,
            status: "new" as const,
            title: "Inspect library boiler",
            updatedAt: "2026-04-23T12:00:00.000Z",
          },
        ],
        nextCursor: undefined,
      };
      const detail = buildExternalDetail();

      mockedListAllCurrentServerJobs.mockResolvedValue(list);
      mockedGetCurrentServerJobDetail.mockResolvedValue(detail);
      const { loadJobsRouteData } = await import("./_app._org.jobs");

      await expect(
        loadJobsRouteData({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: "external",
          currentUserId: userId,
        })
      ).resolves.toStrictEqual({
        list,
        options: {
          contacts: [
            {
              email: "tenant@example.com",
              id: contactId,
              name: "Tenant Contact",
              phone: "+353 87 111 1111",
              siteIds: [siteId],
            },
          ],
          labels: [],
          members: [],
          serviceAreas: [
            {
              id: serviceAreaId,
              name: "Limerick East",
            },
          ],
          sites: [detail.site],
        },
        viewer: {
          role: "external",
          userId,
        },
      });
      expect(mockedGetCurrentServerJobOptions).not.toHaveBeenCalled();
      expect(mockedGetCurrentServerJobDetail).toHaveBeenCalledWith(workItemId);
    }
  );

  it(
    "normalizes unknown jobs view search values to list mode",
    {
      timeout: 10_000,
    },
    async () => {
      const { decodeJobsSearch } = await import("./_app._org.jobs");

      expect(decodeJobsSearch({ view: "bogus" })).toStrictEqual({
        view: undefined,
      });
      expect(decodeJobsSearch({ view: "map" })).toStrictEqual({
        view: "map",
      });
    }
  );

  it(
    "renders the jobs queue from loader-seeded atom state on the first paint",
    {
      timeout: 10_000,
    },
    async () => {
      const { JobsRouteContent } =
        await import("#/features/jobs/jobs-route-content");

      render(
        <JobsRouteContent
          activeOrganizationId={organizationId}
          activeOrganizationName="Acme Field Ops"
          list={{
            items: [
              {
                createdAt: "2026-04-23T11:00:00.000Z",
                id: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
                kind: "job",
                labels: [],
                priority: "none",
                status: "new",
                title: "Inspect boiler",
                updatedAt: "2026-04-23T12:00:00.000Z",
              },
            ],
            nextCursor: undefined,
          }}
          options={{
            contacts: [],
            labels: [],
            members: [],
            serviceAreas: [],
            sites: [],
          }}
          viewer={{
            role: "owner",
            userId,
          }}
        />
      );

      const [queuePanel] = screen.getAllByTestId("jobs-queue-panel");

      expect(queuePanel).toBeDefined();
      expect(
        within(queuePanel).getAllByText("Inspect boiler").length
      ).toBeGreaterThan(0);
    }
  );

  it(
    "keeps list hotkeys enabled when the routed jobs outlet is present",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      const { JobsRouteContent } =
        await import("#/features/jobs/jobs-route-content");

      render(
        <JobsRouteContent
          activeOrganizationId={organizationId}
          activeOrganizationName="Acme Field Ops"
          list={{
            items: [
              {
                createdAt: "2026-04-23T11:00:00.000Z",
                id: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
                kind: "job",
                labels: [],
                priority: "none",
                status: "new",
                title: "Inspect boiler",
                updatedAt: "2026-04-23T12:00:00.000Z",
              },
            ],
            nextCursor: undefined,
          }}
          listHotkeysEnabled
          options={{
            contacts: [],
            labels: [],
            members: [],
            serviceAreas: [],
            sites: [],
          }}
          viewer={{
            role: "owner",
            userId,
          }}
        >
          <div data-testid="jobs-outlet-placeholder" />
        </JobsRouteContent>
      );

      await user.keyboard("/");

      expect(
        screen.getByRole("textbox", { name: /search jobs/i })
      ).toHaveFocus();
    }
  );
});

function buildExternalDetail(): JobDetailResponse {
  return {
    activity: [],
    comments: [
      {
        authorUserId: userId,
        body: "Ready for review.",
        createdAt: "2026-04-23T11:30:00.000Z",
        id: "66666666-6666-4666-8666-666666666666" as CommentIdType,
        workItemId,
      },
    ],
    contact: {
      email: "tenant@example.com",
      id: contactId,
      name: "Tenant Contact",
      phone: "+353 87 111 1111",
    },
    job: {
      createdAt: "2026-04-23T11:00:00.000Z",
      createdByUserId: userId,
      id: workItemId,
      kind: "job",
      labels: [],
      priority: "none",
      siteId,
      status: "new",
      title: "Inspect library boiler",
      updatedAt: "2026-04-23T12:00:00.000Z",
    },
    site: {
      addressLine1: "King Street",
      country: "IE",
      county: "Limerick",
      eircode: "V94 X2X2",
      geocodedAt: "2026-04-27T10:00:00.000Z",
      geocodingProvider: "stub",
      id: siteId,
      latitude: 52.6638,
      longitude: -8.6267,
      name: "King Street Library",
      serviceAreaId,
      serviceAreaName: "Limerick East",
    },
    viewerAccess: {
      canComment: true,
      visibility: "external",
    },
    visits: [],
  };
}
