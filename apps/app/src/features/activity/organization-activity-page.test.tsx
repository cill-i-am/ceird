import type {
  ActivityIdType,
  CostLineIdType,
  OrganizationActivityItem,
  OrganizationActivityListResponse,
  UserIdType,
  WorkItemIdType,
} from "@ceird/jobs-core";
import type { LabelIdType } from "@ceird/labels-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import type { ActivitySearch } from "./activity-search";

const taylorUserId = "user_taylor" as UserIdType;
const jordanUserId = "user_jordan" as UserIdType;

const mixedActivity = {
  items: [
    makeActivityItem({
      actorId: taylorUserId,
      actorName: "Taylor Owner",
      createdAt: "2026-04-28T10:15:00.000Z",
      eventType: "job_created",
      id: "activity_job_created" as ActivityIdType,
      jobTitle: "Inspect boiler",
      payload: {
        eventType: "job_created",
        kind: "job",
        priority: "none",
        title: "Inspect boiler",
      },
      workItemId: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
    }),
    makeActivityItem({
      actorId: jordanUserId,
      actorName: "Jordan Admin",
      createdAt: "2026-04-27T09:00:00.000Z",
      eventType: "label_added",
      id: "activity_label_added" as ActivityIdType,
      jobTitle: "Paint lobby",
      payload: {
        eventType: "label_added",
        labelId: "22222222-2222-4222-8222-222222222222" as LabelIdType,
        labelName: "Urgent",
      },
      workItemId: "22222222-2222-4222-8222-222222222222" as WorkItemIdType,
    }),
    makeActivityItem({
      actorId: taylorUserId,
      actorName: "Taylor Owner",
      createdAt: "2026-04-26T08:00:00.000Z",
      eventType: "cost_line_added",
      id: "activity_cost_line_added" as ActivityIdType,
      jobTitle: "Replace pump",
      payload: {
        costLineId: "33333333-3333-4333-8333-333333333333" as CostLineIdType,
        costLineType: "material",
        eventType: "cost_line_added",
      },
      workItemId: "33333333-3333-4333-8333-333333333333" as WorkItemIdType,
    }),
  ],
  nextCursor: undefined,
} satisfies OrganizationActivityListResponse;

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      params,
      to,
      ...props
    }: ComponentProps<"a"> & {
      params?: { jobId?: string };
      to?: string;
    }) => (
      <a href={to?.replace("$jobId", params?.jobId ?? "")} {...props}>
        {children}
      </a>
    )) as typeof actual.Link,
  };
});

describe("organization activity page", () => {
  it(
    "renders activity rows and filters",
    {
      timeout: 10_000,
    },
    async () => {
      const { OrganizationActivityPage } =
        await import("./organization-activity-page");

      render(
        <OrganizationActivityPage
          activity={{
            items: [
              {
                actor: {
                  email: "taylor@example.com",
                  id: "user_taylor" as UserIdType,
                  name: "Taylor Owner",
                },
                createdAt: "2026-04-28T10:15:00.000Z",
                eventType: "job_created",
                id: "activity_123" as ActivityIdType,
                jobTitle: "Inspect boiler",
                payload: {
                  eventType: "job_created",
                  kind: "job",
                  priority: "none",
                  title: "Inspect boiler",
                },
                workItemId:
                  "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
              },
            ],
            nextCursor: undefined,
          }}
          onSearchChange={vi.fn<(search: ActivitySearch) => void>()}
          options={{
            members: [
              {
                id: "user_taylor" as UserIdType,
                name: "Taylor Owner",
              },
            ],
          }}
          search={{}}
        />
      );

      expect(
        screen.getByText("Taylor Owner created the job.")
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Actor")).toBeInTheDocument();
      expect(screen.getByLabelText("Event type")).toBeInTheDocument();
      expect(screen.getByLabelText("From date")).toBeInTheDocument();
      expect(screen.getByLabelText("To date")).toBeInTheDocument();
      expect(screen.getByLabelText("Job title")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Inspect boiler" })
      ).toHaveAttribute("href", "/jobs/11111111-1111-4111-8111-111111111111");
    }
  );

  it(
    "does not show stale event rows after the event type filter changes",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      const onSearchChange = vi.fn<(search: ActivitySearch) => void>();
      const { OrganizationActivityPage } =
        await import("./organization-activity-page");

      const { rerender } = render(
        <OrganizationActivityPage
          activity={mixedActivity}
          onSearchChange={onSearchChange}
          options={{
            members: [
              {
                id: taylorUserId,
                name: "Taylor Owner",
              },
              {
                id: jordanUserId,
                name: "Jordan Admin",
              },
            ],
          }}
          search={{}}
        />
      );

      await user.selectOptions(
        screen.getByLabelText("Event type"),
        "cost_line_added"
      );

      expect(onSearchChange).toHaveBeenCalledWith({
        eventType: "cost_line_added",
      });

      rerender(
        <OrganizationActivityPage
          activity={mixedActivity}
          onSearchChange={onSearchChange}
          options={{
            members: [
              {
                id: taylorUserId,
                name: "Taylor Owner",
              },
              {
                id: jordanUserId,
                name: "Jordan Admin",
              },
            ],
          }}
          search={{ eventType: "cost_line_added" }}
        />
      );

      expect(screen.getByLabelText("Event type")).toHaveValue(
        "cost_line_added"
      );
      expect(
        screen.getByText("Taylor Owner added a material cost line.")
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Taylor Owner created the job.")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Jordan Admin added the Urgent label.")
      ).not.toBeInTheDocument();
    }
  );

  it.each([
    {
      hiddenSummary: "Jordan Admin added the Urgent label.",
      search: { actorUserId: taylorUserId },
      visibleSummary: "Taylor Owner added a material cost line.",
    },
    {
      hiddenSummary: "Taylor Owner added a material cost line.",
      search: { fromDate: "2026-04-27" },
      visibleSummary: "Taylor Owner created the job.",
    },
    {
      hiddenSummary: "Taylor Owner created the job.",
      search: { toDate: "2026-04-27" },
      visibleSummary: "Taylor Owner added a material cost line.",
    },
    {
      hiddenSummary: "Taylor Owner created the job.",
      search: { jobTitle: "pump" },
      visibleSummary: "Taylor Owner added a material cost line.",
    },
  ] satisfies {
    hiddenSummary: string;
    search: ActivitySearch;
    visibleSummary: string;
  }[])(
    "applies current $search filter state to stale loader rows",
    {
      timeout: 10_000,
    },
    async ({ hiddenSummary, search, visibleSummary }) => {
      const { OrganizationActivityPage } =
        await import("./organization-activity-page");

      render(
        <OrganizationActivityPage
          activity={mixedActivity}
          onSearchChange={vi.fn<(nextSearch: ActivitySearch) => void>()}
          options={{
            members: [
              {
                id: taylorUserId,
                name: "Taylor Owner",
              },
              {
                id: jordanUserId,
                name: "Jordan Admin",
              },
            ],
          }}
          search={search}
        />
      );

      expect(screen.getByText(visibleSummary)).toBeInTheDocument();
      expect(screen.queryByText(hiddenSummary)).not.toBeInTheDocument();
    }
  );

  it(
    "renders an empty state when no activity matches",
    {
      timeout: 10_000,
    },
    async () => {
      const { OrganizationActivityPage } =
        await import("./organization-activity-page");

      render(
        <OrganizationActivityPage
          activity={{
            items: [],
            nextCursor: undefined,
          }}
          onSearchChange={vi.fn<(search: ActivitySearch) => void>()}
          options={{
            members: [],
          }}
          search={{ eventType: "job_created" }}
        />
      );

      expect(screen.getByText("No activity found")).toBeInTheDocument();
    }
  );

  it(
    "commits the job title filter on blur",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      const onSearchChange = vi.fn<(search: ActivitySearch) => void>();
      const { OrganizationActivityPage } =
        await import("./organization-activity-page");

      render(
        <OrganizationActivityPage
          activity={{
            items: [],
            nextCursor: undefined,
          }}
          onSearchChange={onSearchChange}
          options={{
            members: [],
          }}
          search={{}}
        />
      );

      await user.type(screen.getByLabelText("Job title"), "  Boiler  ");

      expect(onSearchChange).not.toHaveBeenCalled();

      await user.tab();

      expect(onSearchChange).toHaveBeenCalledExactlyOnceWith({
        jobTitle: "Boiler",
      });
    }
  );
});

function makeActivityItem(
  item: Omit<OrganizationActivityItem, "actor"> & {
    readonly actorId: UserIdType;
    readonly actorName: string;
  }
): OrganizationActivityItem {
  const { actorId, actorName, ...activityItem } = item;

  return {
    ...activityItem,
    actor: {
      email: `${actorName.toLowerCase().replaceAll(" ", ".")}@example.com`,
      id: actorId,
      name: actorName,
    },
  };
}
