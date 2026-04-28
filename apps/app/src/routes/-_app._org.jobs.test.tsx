/* oxlint-disable vitest/prefer-import-in-mock */
import { decodeOrganizationId } from "@task-tracker/identity-core";
import type { WorkItemIdType } from "@task-tracker/jobs-core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

type AsyncLoaderMock = (...args: unknown[]) => Promise<unknown>;
const organizationId = decodeOrganizationId("org_123");

const {
  mockedEnsureActiveOrganizationId,
  mockedGetCurrentOrganizationMemberRole,
  mockedGetCurrentServerJobOptions,
  mockedListAllCurrentServerJobs,
} = vi.hoisted(() => ({
  mockedEnsureActiveOrganizationId: vi.fn<AsyncLoaderMock>(),
  mockedGetCurrentOrganizationMemberRole: vi.fn<AsyncLoaderMock>(),
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
        members: [],
        serviceAreas: [],
        sites: [],
      };

      mockedListAllCurrentServerJobs.mockResolvedValue(list);
      mockedGetCurrentServerJobOptions.mockResolvedValue(options);
      mockedEnsureActiveOrganizationId.mockResolvedValue({
        activeOrganizationId: organizationId,
        activeOrganizationSync: {
          required: false,
          targetOrganizationId: organizationId,
        },
        currentUserId: "user_123",
        session: {
          user: {
            id: "user_123",
          },
        },
      });
      mockedGetCurrentOrganizationMemberRole.mockResolvedValue({
        role: "owner",
      });

      const { loadJobsRouteData } = await import("./_app._org.jobs");

      await expect(loadJobsRouteData()).resolves.toStrictEqual({
        list,
        options,
        viewer: {
          role: "owner",
          userId: "user_123",
        },
      });
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
          currentUserId: "user_123",
        })
      ).resolves.toStrictEqual({
        list: {
          items: [],
          nextCursor: undefined,
        },
        options: {
          contacts: [],
          members: [],
          serviceAreas: [],
          sites: [],
        },
        viewer: {
          role: "member",
          userId: "user_123",
        },
      });
      expect(mockedListAllCurrentServerJobs).not.toHaveBeenCalled();
      expect(mockedGetCurrentServerJobOptions).not.toHaveBeenCalled();
      expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
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
            members: [],
            serviceAreas: [],
            sites: [],
          }}
          viewer={{
            role: "owner",
            userId: "user_123",
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
            members: [],
            serviceAreas: [],
            sites: [],
          }}
          viewer={{
            role: "owner",
            userId: "user_123",
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
