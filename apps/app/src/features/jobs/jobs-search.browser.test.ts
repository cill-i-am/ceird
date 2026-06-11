import { decodeJobsSearch } from "./jobs-search";

describe("jobs search", () => {
  it("decodes route-aware proximity search without origin details", () => {
    expect(
      decodeJobsSearch({
        near: "true",
        origin: "53.3498,-6.2603",
        routeLimit: "25",
        view: "map",
      })
    ).toStrictEqual({
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
    ).toStrictEqual({
      near: false,
      routeLimit: undefined,
      view: undefined,
    });
  });
});
