import type {
  ActivityIdType,
  UserIdType,
  WorkItemIdType,
} from "@task-tracker/jobs-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

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
          onSearchChange={vi.fn()}
          options={{
            contacts: [],
            members: [
              {
                id: "user_taylor" as UserIdType,
                name: "Taylor Owner",
              },
            ],
            regions: [],
            sites: [],
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
          onSearchChange={vi.fn()}
          options={{
            contacts: [],
            members: [],
            regions: [],
            sites: [],
          }}
          search={{ eventType: "job_created" }}
        />
      );

      expect(screen.getByText("No activity found")).toBeInTheDocument();
    }
  );
});
