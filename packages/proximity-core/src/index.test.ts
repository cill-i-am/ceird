import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { OpenApi } from "effect/unstable/httpapi";

import {
  ProximityApi,
  ProximityApiGroup,
  ProximityCostGuardError,
  ProximityLimitSchema,
  ProximityOriginInputSchema,
  RouteDisplayLineSchema,
  RouteSummarySchema,
} from "./index.js";

describe("proximity-core", () => {
  it("decodes current-location and typed-origin inputs as strict discriminated unions", () => {
    const decodeOrigin = Schema.decodeUnknownSync(ProximityOriginInputSchema);

    expect(
      decodeOrigin({
        accuracyMeters: 12,
        coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
        mode: "current_location",
      })
    ).toStrictEqual({
      accuracyMeters: 12,
      coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
      mode: "current_location",
    });

    expect(
      decodeOrigin({
        coordinates: { latitude: 53.342_886, longitude: -6.267_428 },
        displayText: "Dublin 8",
        mode: "typed_origin",
        placeId: "ChIJL6wn6oAOZ0gRoHExl6nHAAo",
      }).mode
    ).toBe("typed_origin");

    expect(() =>
      decodeOrigin({
        coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
        displayText: "Dublin",
        mode: "current_location",
      })
    ).toThrow(/[Uu]nexpected/);

    expect(() =>
      decodeOrigin({
        coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
        mode: "typed_origin",
        placeId: "ChIJL6wn6oAOZ0gRoHExl6nHAAo",
      })
    ).toThrow(/displayText/);
  });

  it("validates route limits and route summaries", () => {
    const decodeLimit = Schema.decodeUnknownSync(ProximityLimitSchema);
    const decodeRouteSummary = Schema.decodeUnknownSync(RouteSummarySchema);

    expect(decodeLimit(1)).toBe(1);
    expect(decodeLimit(25)).toBe(25);
    expect(() => decodeLimit(0)).toThrow(/greater than 0/);
    expect(() => decodeLimit(26)).toThrow(/less than or equal to 25/);

    expect(
      decodeRouteSummary({
        computedAt: "2026-06-06T10:00:00.000Z",
        distanceMeters: 4200,
        durationSeconds: 840,
        provider: "google_routes",
        providerRequestKind: "matrix",
        routeStatus: "ok",
        trafficAware: true,
      }).durationSeconds
    ).toBe(840);

    expect(() =>
      decodeRouteSummary({
        computedAt: "2026-06-06T10:00:00.000Z",
        distanceMeters: 4200,
        durationSeconds: 0,
        provider: "google_routes",
        providerRequestKind: "matrix",
        routeStatus: "ok",
        trafficAware: true,
      })
    ).toThrow(/greater than 0/);

    expect(() =>
      decodeRouteSummary({
        computedAt: "2026-06-06T10:00:00.000Z",
        distanceMeters: -1,
        durationSeconds: 840,
        provider: "google_routes",
        providerRequestKind: "matrix",
        routeStatus: "ok",
        trafficAware: true,
      })
    ).toThrow(/greater than or equal to 0/);
  });

  it("keeps route display lines explicit and display-only", () => {
    const decodeRouteLine = Schema.decodeUnknownSync(RouteDisplayLineSchema);

    expect(
      decodeRouteLine({
        encodedPolyline: "}_p~F~ps|U_ulLnnqC_mqNvxq`@",
        format: "encoded_polyline",
      })
    ).toStrictEqual({
      encodedPolyline: "}_p~F~ps|U_ulLnnqC_mqNvxq`@",
      format: "encoded_polyline",
    });

    expect(() =>
      decodeRouteLine({
        encodedPolyline: "}_p~F~ps|U_ulLnnqC_mqNvxq`@",
        format: "geojson_linestring",
      })
    ).toThrow(/[Uu]nexpected|coordinates/);
  });

  it("exports typed cost guard errors", () => {
    expect(
      new ProximityCostGuardError({
        limit: 500,
        message: "Route quota guard blocked this request.",
        retryAfterSeconds: 60,
        scope: "actor",
      })._tag
    ).toBe("@ceird/proximity-core/ProximityCostGuardError");
  });

  it("exposes temporary origin endpoints", () => {
    const spec = OpenApi.fromApi(ProximityApi);

    expect(ProximityApiGroup.identifier).toBe("proximity");
    expect(
      spec.paths["/proximity/origins/autocomplete"]?.post?.operationId
    ).toBe("proximity.autocompleteOrigin");
    expect(
      spec.paths["/proximity/origins/place-details"]?.post?.operationId
    ).toBe("proximity.getOriginPlaceDetails");
  });
});
