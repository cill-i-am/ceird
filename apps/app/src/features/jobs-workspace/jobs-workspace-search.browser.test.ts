import { decodeJobsWorkspaceSearch } from "./jobs-workspace-search";

describe("jobs workspace search", () => {
  it("keeps only supported route state values", () => {
    expect(
      decodeJobsWorkspaceSearch({
        status: "blocked",
        view: "board",
      })
    ).toStrictEqual({
      status: "blocked",
      view: "board",
    });

    expect(
      decodeJobsWorkspaceSearch({
        status: "triaged",
        view: "map",
      })
    ).toStrictEqual({
      status: undefined,
      view: undefined,
    });
  });
});
