import { decodeSitesSearch } from "./sites-search";

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
    });
  });
});
