import { decodeJobsWorkspaceSearch } from "./jobs-workspace-search";

describe("jobs workspace search", () => {
  it("keeps only supported route state values", () => {
    expect(
      decodeJobsWorkspaceSearch({
        detailJobId: "11111111-1111-4111-8111-111111111111",
        labelId: "label_123",
        query: " boiler ",
        recentSearch: "pump",
        sort: "priority",
        status: "blocked",
        view: "board",
      })
    ).toStrictEqual({
      detailJobId: "11111111-1111-4111-8111-111111111111",
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
      detailJobId: undefined,
      labelId: undefined,
      query: undefined,
      recentSearch: undefined,
      sort: undefined,
      status: undefined,
      view: undefined,
    });
  });
});
