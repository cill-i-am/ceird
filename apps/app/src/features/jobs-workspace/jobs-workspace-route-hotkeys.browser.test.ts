import { shouldEnableJobsWorkspaceHotkeys } from "./jobs-workspace-route-hotkeys";

describe("jobs workspace route hotkeys", () => {
  it("enables route-local hotkeys only on the jobs workspace route", () => {
    expect(
      shouldEnableJobsWorkspaceHotkeys({ pathname: "/jobs-workspace" })
    ).toBeTruthy();
    expect(shouldEnableJobsWorkspaceHotkeys({ pathname: "/jobs" })).toBeFalsy();
  });
});
