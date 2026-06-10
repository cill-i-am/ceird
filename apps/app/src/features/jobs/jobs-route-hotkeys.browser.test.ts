import type { WorkItemIdType } from "@ceird/jobs-core";

import { shouldEnableJobsListHotkeys } from "./jobs-route-hotkeys";

describe("jobs route hotkeys", () => {
  it("disables list hotkeys while a workspace sheet is active", () => {
    expect(
      shouldEnableJobsListHotkeys({
        pathname: "/jobs",
        stack: [],
      })
    ).toBeTruthy();

    expect(
      shouldEnableJobsListHotkeys({
        pathname: "/jobs",
        stack: [
          {
            jobId: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
            kind: "job.detail",
          },
        ],
      })
    ).toBeFalsy();
  });
});
