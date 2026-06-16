import { decodeJobsWorkspaceSearch } from "./jobs-workspace-search";

describe("jobs workspace search", () => {
  it("keeps only supported route state values", () => {
    expect(
      decodeJobsWorkspaceSearch({
        labelId: "label_123",
        query: " boiler ",
        recentSearch: "pump",
        sort: "priority",
        status: "blocked",
        view: "board",
      })
    ).toStrictEqual({
      labelId: "label_123",
      query: "boiler",
      recentSearch: "pump",
      sort: "priority",
      status: "blocked",
      view: "board",
    });

    expect(
      decodeJobsWorkspaceSearch({
        labelId: "",
        query: " ",
        sort: "random",
        status: "triaged",
        view: "map",
      })
    ).toStrictEqual({
      labelId: undefined,
      query: undefined,
      recentSearch: undefined,
      sort: undefined,
      status: undefined,
      view: undefined,
    });
  });
});
