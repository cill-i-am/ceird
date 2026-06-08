import { routeDisplayLineToMapCoordinates } from "./route-display-line";

describe("route display line", () => {
  it("converts geojson route lines to map coordinates", () => {
    expect(
      routeDisplayLineToMapCoordinates({
        coordinates: [
          { latitude: 53.3498, longitude: -6.2603 },
          { latitude: 53.36, longitude: -6.24 },
        ],
        format: "geojson_linestring",
      })
    ).toStrictEqual([
      [-6.2603, 53.3498],
      [-6.24, 53.36],
    ]);
  });

  it("decodes encoded polyline route lines to map coordinates", () => {
    expect(
      routeDisplayLineToMapCoordinates({
        encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
        format: "encoded_polyline",
      })
    ).toStrictEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it("returns no coordinates when no route line is available", () => {
    expect(routeDisplayLineToMapCoordinates()).toStrictEqual([]);
  });

  it("returns no coordinates for malformed encoded polyline data", () => {
    expect(
      routeDisplayLineToMapCoordinates({
        encodedPolyline: "_p~iF~ps|U_",
        format: "encoded_polyline",
      })
    ).toStrictEqual([]);
  });
});
