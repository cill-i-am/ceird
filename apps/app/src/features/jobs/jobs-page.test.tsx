import { RegistryProvider } from "@effect-atom/atom-react";
import type {
  JobListResponse,
  JobOptionsResponse,
  RegionIdType,
  SiteIdType,
  UserIdType,
  WorkItemIdType,
} from "@task-tracker/jobs-core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { JobsPage } from "./jobs-page";
import {
  jobsListStateAtom,
  jobsOptionsStateAtom,
  seedJobsListState,
  seedJobsOptionsState,
} from "./jobs-state";
import type { JobsViewer } from "./jobs-viewer";

const memberOneId = "11111111-1111-4111-8111-111111111111" as UserIdType;
const memberTwoId = "22222222-2222-4222-8222-222222222222" as UserIdType;
const regionNorthId = "33333333-3333-4333-8333-333333333333" as RegionIdType;
const regionWestId = "44444444-4444-4444-8444-444444444444" as RegionIdType;
const siteDepotId = "55555555-5555-4555-8555-555555555555" as SiteIdType;
const siteSchoolId = "66666666-6666-4666-8666-666666666666" as SiteIdType;
const originalInnerWidth = window.innerWidth;

const initialList: JobListResponse = {
  items: [
    {
      assigneeId: memberOneId,
      coordinatorId: memberTwoId,
      createdAt: "2026-01-01T00:15:00.000Z",
      id: "77777777-7777-4777-8777-777777777777" as WorkItemIdType,
      kind: "job",
      priority: "high",
      siteId: siteDepotId,
      status: "new",
      title: "Inspect boiler",
      updatedAt: "2026-01-01T00:30:00.000Z",
    },
    {
      assigneeId: memberOneId,
      coordinatorId: memberTwoId,
      createdAt: "2026-04-23T11:30:00.000Z",
      id: "88888888-8888-4888-8888-888888888888" as WorkItemIdType,
      kind: "job",
      priority: "urgent",
      siteId: siteDepotId,
      status: "blocked",
      title: "Await materials",
      updatedAt: "2026-04-23T12:30:00.000Z",
    },
    {
      assigneeId: memberTwoId,
      coordinatorId: memberOneId,
      createdAt: "2026-04-23T13:00:00.000Z",
      id: "99999999-9999-4999-8999-999999999999" as WorkItemIdType,
      kind: "job",
      priority: "medium",
      siteId: siteSchoolId,
      status: "triaged",
      title: "Finalize snag list",
      updatedAt: "2026-04-23T14:00:00.000Z",
    },
    {
      assigneeId: memberTwoId,
      coordinatorId: memberOneId,
      createdAt: "2026-04-23T14:30:00.000Z",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as WorkItemIdType,
      kind: "job",
      priority: "low",
      siteId: siteSchoolId,
      status: "completed",
      title: "Closed inspection",
      updatedAt: "2026-04-23T15:00:00.000Z",
    },
    {
      createdAt: "2026-04-23T15:30:00.000Z",
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as WorkItemIdType,
      kind: "job",
      priority: "none",
      status: "canceled",
      title: "Canceled visit",
      updatedAt: "2026-04-23T16:00:00.000Z",
    },
  ],
  nextCursor: undefined,
};

const initialOptions: JobOptionsResponse = {
  contacts: [],
  members: [
    {
      id: memberOneId,
      name: "Taylor Owner",
    },
    {
      id: memberTwoId,
      name: "Casey Member",
    },
  ],
  regions: [
    {
      id: regionNorthId,
      name: "North",
    },
    {
      id: regionWestId,
      name: "West",
    },
  ],
  sites: [
    {
      id: siteDepotId,
      name: "Depot",
      regionId: regionNorthId,
      regionName: "North",
    },
    {
      id: siteSchoolId,
      name: "School",
      regionId: regionWestId,
      regionName: "West",
    },
  ],
};

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

describe("jobs page", () => {
  afterEach(() => {
    setViewportWidth(originalInnerWidth);
  });

  it(
    "defaults to the active view and can reveal completed jobs",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();

      renderJobsPage();
      const queuePanel = getPrimaryQueuePanel();

      expect(screen.getByRole("heading", { name: "Jobs" })).toBeInTheDocument();
      expect(
        within(queuePanel).getAllByText("Inspect boiler").length
      ).toBeGreaterThan(0);
      expect(
        within(queuePanel).getAllByText("Await materials").length
      ).toBeGreaterThan(0);
      expect(
        within(queuePanel).getAllByText("Finalize snag list").length
      ).toBeGreaterThan(0);
      expect(
        within(queuePanel).queryByText("Closed inspection")
      ).not.toBeInTheDocument();
      expect(
        within(queuePanel).queryByText("Canceled visit")
      ).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /new job/i })).toHaveAttribute(
        "href",
        "/jobs/new"
      );
      expect(within(queuePanel).getAllByText(/Jan 1/).length).toBeGreaterThan(
        0
      );

      await chooseCommandFilter(user, /status filter/i, "All jobs");

      expect(
        within(queuePanel).getAllByText("Closed inspection").length
      ).toBeGreaterThan(0);
      expect(
        within(queuePanel).getAllByText("Canceled visit").length
      ).toBeGreaterThan(0);
    }
  );

  it(
    "mounts a single desktop workspace shell",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();

      renderJobsPage({ viewportWidth: 1280 });

      expect(screen.getAllByTestId("jobs-queue-panel")).toHaveLength(1);
      expect(
        screen.queryByTestId("jobs-coverage-panel")
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Map" }));

      await waitFor(() => {
        expect(screen.getAllByTestId("jobs-coverage-panel")).toHaveLength(1);
        expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
      });
    }
  );

  it(
    "switches between list and map views below the xl breakpoint",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();

      renderJobsPage({ viewportWidth: 1279 });

      expect(screen.getAllByTestId("jobs-queue-panel")).toHaveLength(1);
      expect(
        screen.queryByTestId("jobs-coverage-panel")
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Map" }));

      await waitFor(() => {
        expect(screen.getAllByTestId("jobs-coverage-panel")).toHaveLength(1);
      });

      expect(screen.queryByTestId("jobs-queue-panel")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "List" }));

      expect(screen.getAllByTestId("jobs-queue-panel")).toHaveLength(1);
    }
  );

  it("hides the create affordance for members", () => {
    renderJobsPage({
      viewer: {
        role: "member",
        userId: memberTwoId,
      },
    });

    expect(
      screen.queryByRole("link", { name: /new job/i })
    ).not.toBeInTheDocument();
  }, 10_000);

  it(
    "filters by assignee and priority with real atom state",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();

      renderJobsPage();
      const queuePanel = getPrimaryQueuePanel();

      await chooseCommandFilter(user, /assignee filter/i, "Taylor Owner");

      expect(
        within(queuePanel).getAllByText("Inspect boiler").length
      ).toBeGreaterThan(0);
      expect(
        within(queuePanel).getAllByText("Await materials").length
      ).toBeGreaterThan(0);
      expect(
        within(queuePanel).queryByText("Finalize snag list")
      ).not.toBeInTheDocument();

      await chooseCommandFilter(user, /priority filter/i, "Urgent");

      expect(
        within(queuePanel).queryByText("Inspect boiler")
      ).not.toBeInTheDocument();
      expect(
        within(queuePanel).getAllByText("Await materials").length
      ).toBeGreaterThan(0);
      const activeFilters = screen.getByLabelText("Active filters");
      expect(
        within(activeFilters).getByText("Assignee: Taylor Owner")
      ).toBeInTheDocument();
      expect(
        within(activeFilters).getByText("Priority: Urgent")
      ).toBeInTheDocument();

      await user.click(
        within(activeFilters).getByRole("button", { name: /clear all/i })
      );

      expect(
        within(queuePanel).getAllByText("Inspect boiler").length
      ).toBeGreaterThan(0);
      expect(
        within(queuePanel).getAllByText("Finalize snag list").length
      ).toBeGreaterThan(0);
    }
  );

  it(
    "filters by coordinator, region, and site with the seeded options data",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();

      renderJobsPage();
      const queuePanel = getPrimaryQueuePanel();

      await chooseCommandFilter(
        user,
        /more filter/i,
        "Coordinator: Taylor Owner"
      );

      expect(
        within(queuePanel).queryByText("Inspect boiler")
      ).not.toBeInTheDocument();
      expect(
        within(queuePanel).queryByText("Await materials")
      ).not.toBeInTheDocument();
      expect(
        within(queuePanel).getAllByText("Finalize snag list").length
      ).toBeGreaterThan(0);

      await chooseCommandFilter(user, /more filter/i, "Region: North");

      expect(screen.getByText(/no jobs here/i)).toBeInTheDocument();

      await chooseCommandFilter(user, /more filter/i, "All coordinators");
      await chooseCommandFilter(user, /site filter/i, "Depot");

      const filteredQueuePanel = getPrimaryQueuePanel();
      expect(
        within(filteredQueuePanel).getAllByText("Inspect boiler").length
      ).toBeGreaterThan(0);
      expect(
        within(filteredQueuePanel).getAllByText("Await materials").length
      ).toBeGreaterThan(0);
      expect(
        within(filteredQueuePanel).queryByText("Finalize snag list")
      ).not.toBeInTheDocument();
    }
  );
});

async function chooseCommandFilter(
  user: ReturnType<typeof userEvent.setup>,
  buttonName: RegExp,
  optionText: string
) {
  await user.click(screen.getByRole("button", { name: buttonName }));
  await waitFor(() => {
    expect(screen.getAllByText(optionText).length).toBeGreaterThan(0);
  });

  const matches = screen.getAllByText(optionText);
  const option = matches.at(-1);

  if (!option) {
    throw new Error(`Expected command option "${optionText}" to be visible.`);
  }

  await user.click(option);
}

function getPrimaryQueuePanel() {
  const [queuePanel] = screen.getAllByTestId("jobs-queue-panel");

  if (!queuePanel) {
    throw new Error("Expected a jobs queue panel in the page.");
  }

  return queuePanel;
}

function renderJobsPage(options?: {
  readonly viewer?: JobsViewer;
  readonly viewportWidth?: number;
}) {
  setViewportWidth(options?.viewportWidth ?? 1440);

  return render(
    <RegistryProvider
      initialValues={[
        [jobsListStateAtom, seedJobsListState("org_123", initialList)],
        [jobsOptionsStateAtom, seedJobsOptionsState("org_123", initialOptions)],
      ]}
    >
      <JobsPage
        activeOrganizationName="Acme Field Ops"
        viewer={
          options?.viewer ?? {
            role: "owner",
            userId: memberOneId,
          }
        }
      />
    </RegistryProvider>
  );
}

function setViewportWidth(value: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value,
    writable: true,
  });
  window.dispatchEvent(new Event("resize"));
}
