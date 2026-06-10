import { decodeSitesSearch, isSitesMapViewSearch } from "./sites-search";

describe("sites search", () => {
  it("decodes route-aware proximity search without origin details", () => {
    expect(
      decodeSitesSearch({
        near: "true",
        origin: "53.3498,-6.2603",
        routeLimit: "25",
      })
    ).toStrictEqual({
      near: true,
      routeLimit: 25,
      view: undefined,
    });
  });

  it("normalizes unsupported route-aware search values", () => {
    expect(
      decodeSitesSearch({
        near: "false",
        routeLimit: "10abc",
      })
    ).toStrictEqual({
      near: false,
      routeLimit: undefined,
      view: undefined,
    });
  });

  it("decodes supported view modes", () => {
    expect(decodeSitesSearch({ view: "map" })).toStrictEqual({
      near: undefined,
      routeLimit: undefined,
      view: "map",
    });
    expect(decodeSitesSearch({ view: "list" })).toStrictEqual({
      near: undefined,
      routeLimit: undefined,
      view: "list",
    });
  });

  it("drops unsupported view modes", () => {
    expect(decodeSitesSearch({ view: "calendar" })).toStrictEqual({
      near: undefined,
      routeLimit: undefined,
      view: undefined,
    });
    expect(decodeSitesSearch(null)).toStrictEqual({
      near: undefined,
      routeLimit: undefined,
      view: undefined,
    });
  });

  it("detects map view search state", () => {
    expect(isSitesMapViewSearch({ view: "map" })).toBeTruthy();
    expect(isSitesMapViewSearch({ view: "list" })).toBeFalsy();
    expect(isSitesMapViewSearch({ view: "calendar" })).toBeFalsy();
  });
});
