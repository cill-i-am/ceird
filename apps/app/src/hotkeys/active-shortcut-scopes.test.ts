import { getActiveShortcutScopes } from "./active-shortcut-scopes";

describe("active shortcut scopes", () => {
  it("activates job drawer shortcut scopes for job drawer routes", () => {
    expect(getActiveShortcutScopes("/jobs/new")).toStrictEqual([
      "global",
      "jobs",
      "job-create",
    ]);
    expect(
      getActiveShortcutScopes("/jobs/11111111-1111-4111-8111-111111111111")
    ).toStrictEqual(["global", "jobs", "job-detail"]);
  });

  it("activates members, settings, and map shortcut scopes on matching routes", () => {
    expect(getActiveShortcutScopes("/members")).toStrictEqual([
      "global",
      "members",
    ]);
    expect(getActiveShortcutScopes("/settings")).toStrictEqual([
      "global",
      "settings",
    ]);
    expect(getActiveShortcutScopes("/organization/settings")).toStrictEqual([
      "global",
      "settings",
    ]);
    expect(getActiveShortcutScopes("/jobs", { view: "map" })).toStrictEqual([
      "global",
      "jobs",
      "map",
    ]);
    expect(getActiveShortcutScopes("/jobs")).toStrictEqual(["global", "jobs"]);
  });

  it("uses only global shortcut scope on the activity route", () => {
    expect(getActiveShortcutScopes("/activity")).toStrictEqual(["global"]);
  });
});
