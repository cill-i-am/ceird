import type {
  CreateJobResponse,
  JobLabelIdType,
  UserIdType,
  WorkItemIdType,
} from "@task-tracker/jobs-core";

import { toJobListItem } from "./jobs-state";

describe("jobs state", () => {
  it("preserves labels when converting a job response to a list item", () => {
    const label = {
      createdAt: "2026-04-23T10:00:00.000Z",
      id: "12121212-1212-4121-8121-121212121212" as JobLabelIdType,
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
});
