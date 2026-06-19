import { decodeSitesWorkspaceSearch } from "./sites-workspace-search";

describe("sites workspace search", () => {
  it("decodes supported shell states", () => {
    expect(decodeSitesWorkspaceSearch({ shell: "loading" })).toMatchObject({
      shell: "loading",
    });
    expect(decodeSitesWorkspaceSearch({ shell: "empty" })).toMatchObject({
      shell: "empty",
    });
    expect(decodeSitesWorkspaceSearch({ shell: "ready" })).toMatchObject({
      shell: "ready",
    });
  });

  it("drops unknown shell states so the route fails closed", () => {
    expect(decodeSitesWorkspaceSearch({ shell: "legacy-sites" })).toMatchObject(
      {
        shell: undefined,
      }
    );
  });

  it("decodes route-backed list and detail state for future saved views", () => {
    expect(
      decodeSitesWorkspaceSearch({
        filter: "with-active-jobs",
        labelId: "33333333-3333-4333-8333-333333333333",
        query: "Dublin",
        selectedSiteId: "site_123",
        sort: "active-jobs",
      })
    ).toStrictEqual({
      filter: "with-active-jobs",
      labelId: "33333333-3333-4333-8333-333333333333",
      query: "Dublin",
      selectedSiteId: "site_123",
      shell: undefined,
      sort: "active-jobs",
    });
  });

  it("drops invalid route-backed list state", () => {
    expect(
      decodeSitesWorkspaceSearch({
        filter: "archived",
        labelId: "",
        query: " ",
        selectedSiteId: "",
        sort: "manual",
      })
    ).toStrictEqual({
      filter: undefined,
      labelId: undefined,
      query: undefined,
      selectedSiteId: undefined,
      shell: undefined,
      sort: undefined,
    });
  });
});
