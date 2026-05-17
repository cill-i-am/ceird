import type {
  ContactIdType,
  CreateJobResponse,
  JobListItem,
  UserIdType,
  WorkItemIdType,
} from "@ceird/jobs-core";
import type { LabelIdType } from "@ceird/labels-core";
import type { SiteIdType } from "@ceird/sites-core";

import {
  defaultJobsListFilters,
  filterVisibleJobs,
  toJobListItem,
} from "./jobs-state";

describe("jobs state", () => {
  it("preserves labels when converting a job response to a list item", () => {
    const label = {
      createdAt: "2026-04-23T10:00:00.000Z",
      id: "12121212-1212-4121-8121-121212121212" as LabelIdType,
      name: "Compliance",
      updatedAt: "2026-04-23T10:00:00.000Z",
    };
    const job: CreateJobResponse = {
      createdAt: "2026-04-23T11:00:00.000Z",
      createdByUserId: "22222222-2222-4222-8222-222222222222" as UserIdType,
      id: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
      kind: "job",
      labels: [label],
      priority: "none",
      status: "new",
      title: "Inspect boiler",
      updatedAt: "2026-04-23T12:00:00.000Z",
    };

    expect(toJobListItem(job).labels).toStrictEqual([label]);
  }, 1000);

  it("filters visible jobs through linked contact search text", () => {
    const contactId = "33333333-3333-4333-8333-333333333333" as ContactIdType;
    const siteId = "44444444-4444-4444-8444-444444444444" as SiteIdType;
    const job = {
      createdAt: "2026-04-23T11:00:00.000Z",
      contactId,
      id: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
      kind: "job",
      labels: [],
      priority: "none",
      siteId,
      status: "new",
      title: "Inspect boiler",
      updatedAt: "2026-04-23T12:00:00.000Z",
    } satisfies JobListItem;

    expect(
      filterVisibleJobs({
        filters: {
          ...defaultJobsListFilters,
          query: "alex@example.com",
        },
        items: [job],
        lookup: {
          contactById: new Map([
            [
              contactId,
              {
                email: "alex@example.com",
                id: contactId,
                name: "Alex Caller",
                siteIds: [siteId],
              },
            ],
          ]),
          siteById: new Map(),
        },
      })
    ).toStrictEqual([job]);
  }, 1000);
});
