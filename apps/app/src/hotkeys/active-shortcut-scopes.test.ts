import { getActiveShortcutScopes } from "./active-shortcut-scopes";

describe("active shortcut scopes", () => {
  it("activates home shortcut scope on the organization home route", () => {
    expect(getActiveShortcutScopes("/")).toStrictEqual(["global", "home"]);
  });

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

  it("activates sites, members, settings, and map shortcut scopes on matching routes", () => {
    expect(getActiveShortcutScopes("/sites")).toStrictEqual([
      "global",
      "sites",
    ]);
    expect(getActiveShortcutScopes("/sites/new")).toStrictEqual([
      "global",
      "sites",
    ]);
    expect(
      getActiveShortcutScopes("/sites/55555555-5555-4555-8555-555555555555")
    ).toStrictEqual(["global", "sites"]);
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
