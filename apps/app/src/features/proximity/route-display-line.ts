import type { RouteDisplayLine } from "@ceird/proximity-core";

export type MapLineCoordinate = readonly [longitude: number, latitude: number];

export function routeDisplayLineToMapCoordinates(
  routeLine?: RouteDisplayLine | undefined
): readonly MapLineCoordinate[] {
  if (routeLine === undefined) {
    return [];
  }

  if (routeLine.format === "geojson_linestring") {
    return routeLine.coordinates.map((coordinate) => [
      coordinate.longitude,
      coordinate.latitude,
    ]);
  }

  return decodeEncodedPolyline(routeLine.encodedPolyline);
}

function decodeEncodedPolyline(value: string): readonly MapLineCoordinate[] {
  const coordinates: MapLineCoordinate[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < value.length) {
    const latitudeResult = decodePolylineValue(value, index);
    if (latitudeResult === null) {
      return [];
    }
    index = latitudeResult.nextIndex;
    latitude += latitudeResult.delta;

    const longitudeResult = decodePolylineValue(value, index);
    if (longitudeResult === null) {
      return [];
    }
    index = longitudeResult.nextIndex;
    longitude += longitudeResult.delta;

    const coordinate = [longitude / 100_000, latitude / 100_000] as const;
    if (!isValidMapCoordinate(coordinate)) {
      return [];
    }

    coordinates.push(coordinate);
  }

  return coordinates;
}

function decodePolylineValue(value: string, startIndex: number) {
  let byte = 0;
  let index = startIndex;
  let result = 0;
  let shift = 0;

  do {
    if (index >= value.length) {
      return null;
    }

    byte = (value.codePointAt(index) ?? 63) - 63;
    if (byte < 0) {
      return null;
    }
    index += 1;
    result += (byte % 32) * 2 ** shift;
    shift += 5;
  } while (byte >= 0x20);

  const shiftedResult = Math.floor(result / 2);

  return {
    delta: result % 2 === 1 ? -shiftedResult - 1 : shiftedResult,
    nextIndex: index,
  };
}

function isValidMapCoordinate([longitude, latitude]: MapLineCoordinate) {
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  );
}
