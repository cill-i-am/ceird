import {
  decodeSitesSearch,
  isSitesMapViewSearch,
} from "#/features/sites/sites-search";

describe("sites search", () => {
  it("decodes supported view modes", () => {
    expect(decodeSitesSearch({ view: "map" })).toStrictEqual({ view: "map" });
    expect(decodeSitesSearch({ view: "list" })).toStrictEqual({
      view: "list",
    });
  });

  it("drops unsupported view modes", () => {
    expect(decodeSitesSearch({ view: "calendar" })).toStrictEqual({
      view: undefined,
    });
    expect(decodeSitesSearch(null)).toStrictEqual({ view: undefined });
  });

  it("detects map view search state", () => {
    expect(isSitesMapViewSearch({ view: "map" })).toBeTruthy();
    expect(isSitesMapViewSearch({ view: "list" })).toBeFalsy();
    expect(isSitesMapViewSearch({ view: "calendar" })).toBeFalsy();
  });
});
