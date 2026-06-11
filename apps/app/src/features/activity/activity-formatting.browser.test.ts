import type { JobActivityPayload, VisitIdType } from "@ceird/jobs-core";
import type { LabelIdType } from "@ceird/labels-core";

import { describeJobActivity } from "./activity-formatting";

const visitId = "88888888-8888-4888-8888-888888888888" as VisitIdType;
const labelId = "99999999-9999-4999-8999-999999999999" as LabelIdType;

describe("job activity formatting", () => {
  it.each([
    [
      "assignee_changed",
      { eventType: "assignee_changed" },
      "Taylor Owner updated the assignee.",
    ],
    [
      "blocked_reason_changed",
      {
        eventType: "blocked_reason_changed",
        fromBlockedReason: null,
        toBlockedReason: "Waiting on parts",
      },
      "Taylor Owner updated the blocked reason.",
    ],
    [
      "contact_changed",
      { eventType: "contact_changed" },
      "Taylor Owner updated the contact.",
    ],
    [
      "coordinator_changed",
      { eventType: "coordinator_changed" },
      "Taylor Owner updated the coordinator.",
    ],
    [
      "job_created",
      {
        eventType: "job_created",
        kind: "job",
        priority: "medium",
        title: "Inspect boiler",
      },
      "Taylor Owner created the job.",
    ],
    [
      "job_reopened",
      { eventType: "job_reopened" },
      "Taylor Owner reopened the job.",
    ],
    [
      "label_added",
      { eventType: "label_added", labelId, labelName: "Waiting on PO" },
      "Taylor Owner added the Waiting on PO label.",
    ],
    [
      "label_removed",
      { eventType: "label_removed", labelId, labelName: "Waiting on PO" },
      "Taylor Owner removed the Waiting on PO label.",
    ],
    [
      "priority_changed",
      {
        eventType: "priority_changed",
        fromPriority: "medium",
        toPriority: "urgent",
      },
      "Taylor Owner changed priority from Medium to Urgent.",
    ],
    [
      "site_changed",
      { eventType: "site_changed" },
      "Taylor Owner updated the site.",
    ],
    [
      "status_changed",
      {
        eventType: "status_changed",
        fromStatus: "new",
        toStatus: "in_progress",
      },
      "Taylor Owner changed status from New to In progress.",
    ],
    [
      "visit_logged",
      { eventType: "visit_logged", visitId },
      "Taylor Owner logged a visit.",
    ],
  ] satisfies readonly [string, JobActivityPayload, string][])(
    "formats %s activity with an actor prefix",
    (_eventType, payload, expected) => {
      expect(describeJobActivity("Taylor Owner", payload)).toBe(expected);
    },
    1000
  );

  it("omits the actor prefix when no actor name is available", () => {
    expect(
      describeJobActivity(undefined, {
        eventType: "status_changed",
        fromStatus: "blocked",
        toStatus: "triaged",
      })
    ).toBe("changed status from Blocked to Triaged.");
  }, 1000);
});
