import {
  decodeJobsSearch,
  filtersToJobsSearch,
  jobsSearchToFilters,
  toJobsListQuery,
} from "./jobs-search";

describe("jobs search", () => {
  it("decodes route-aware proximity search without origin details", () => {
    expect(
      decodeJobsSearch({
        near: "true",
        origin: "53.3498,-6.2603",
        routeLimit: "25",
        view: "map",
      })
    ).toMatchObject({
      near: true,
      routeLimit: 25,
      view: "map",
    });
  });

  it("normalizes unsupported route-aware search values", () => {
    expect(
      decodeJobsSearch({
        near: "false",
        routeLimit: "10abc",
        view: "calendar",
      })
    ).toMatchObject({
      near: false,
      routeLimit: undefined,
      view: undefined,
    });
  });

  it("normalizes list filters into server query input", () => {
    const search = decodeJobsSearch({
      assigneeId: "unassigned",
      cursor: "cursor-one",
      labelId: "11111111-1111-4111-8111-111111111111",
      limit: "25",
      priority: "urgent",
      query: "  boiler  ",
      status: "active",
    });

    expect(jobsSearchToFilters(search)).toMatchObject({
      assigneeId: { kind: "unassigned" },
      labelId: "11111111-1111-4111-8111-111111111111",
      priority: "urgent",
      query: "boiler",
      status: "active",
    });
    expect(toJobsListQuery(search)).toStrictEqual({
      assigneeId: "unassigned",
      coordinatorId: undefined,
      cursor: "cursor-one",
      labelId: "11111111-1111-4111-8111-111111111111",
      limit: 25,
      priority: "urgent",
      query: "boiler",
      siteId: undefined,
      status: "active",
    });
  });

  it("omits default filters from URL search updates", () => {
    expect(
      filtersToJobsSearch(jobsSearchToFilters(decodeJobsSearch({})))
    ).toStrictEqual({
      assigneeId: undefined,
      coordinatorId: undefined,
      labelId: undefined,
      priority: undefined,
      query: undefined,
      siteId: undefined,
      status: undefined,
    });
  });
});
