import { getActiveShortcutScopes } from "./active-shortcut-scopes";

describe("active shortcut scopes", () => {
  it("activates home shortcut scope on the organization home route", () => {
    expect(getActiveShortcutScopes("/")).toStrictEqual(["global", "home"]);
  });

  it("activates job drawer shortcut scopes from sheet search state", () => {
    expect(
      getActiveShortcutScopes("/jobs", {
        sheets: [{ kind: "job.create" }],
      })
    ).toStrictEqual(["global", "jobs", "job-create"]);
    expect(
      getActiveShortcutScopes("/sites", {
        sheets: [
          {
            kind: "site.detail",
            siteId: "55555555-5555-4555-8555-555555555555",
          },
          {
            jobId: "11111111-1111-4111-8111-111111111111",
            kind: "job.detail",
          },
        ],
      })
    ).toStrictEqual(["global", "sites", "jobs", "job-detail"]);
  });

  it("activates sites, sites workspace, members, settings, and map shortcut scopes on matching routes", () => {
    expect(getActiveShortcutScopes("/sites")).toStrictEqual([
      "global",
      "sites",
    ]);
    expect(getActiveShortcutScopes("/sites-workspace")).toStrictEqual([
      "global",
      "sites-workspace",
    ]);
    expect(
      getActiveShortcutScopes("/sites", {
        sheets: [
          {
            kind: "site.detail",
            siteId: "55555555-5555-4555-8555-555555555555",
          },
        ],
      })
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
    expect(getActiveShortcutScopes("/jobs-workspace")).toStrictEqual([
      "global",
      "jobs-workspace",
    ]);
  });

  it("uses only global shortcut scope on read-only activity routes", () => {
    expect(getActiveShortcutScopes("/activity")).toStrictEqual(["global"]);
    expect(getActiveShortcutScopes("/organization/security")).toStrictEqual([
      "global",
    ]);
  });
});
