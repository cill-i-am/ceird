import { shouldEnableJobsWorkspaceHotkeys } from "./jobs-workspace-route-hotkeys";

describe("jobs workspace route hotkeys", () => {
  it("enables route-local hotkeys on the cut-over jobs route", () => {
    expect(
      shouldEnableJobsWorkspaceHotkeys({ pathname: "/jobs" })
    ).toBeTruthy();
    expect(
      shouldEnableJobsWorkspaceHotkeys({ pathname: "/jobs-workspace" })
    ).toBeFalsy();
  });
});
