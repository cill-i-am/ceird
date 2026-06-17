import { getPrimaryNavItemsForRole } from "./app-navigation";

describe("app navigation", () => {
  it.each(["owner", "admin"] as const)(
    "shows every organization navigation item for %s users",
    (role) => {
      expect(
        getPrimaryNavItemsForRole(role).map((item) => item.url)
      ).toStrictEqual([
        "/",
        "/jobs",
        "/sites",
        "/activity",
        "/organization/security",
        "/members",
      ]);
    },
    1000
  );

  it("shows internal navigation items for member users", () => {
    expect(
      getPrimaryNavItemsForRole("member").map((item) => item.url)
    ).toStrictEqual(["/", "/jobs", "/sites", "/activity"]);
  }, 1000);

  it("hides internal navigation for external users", () => {
    expect(
      getPrimaryNavItemsForRole("external").map((item) => item.url)
    ).toStrictEqual([]);
  }, 1000);
});
