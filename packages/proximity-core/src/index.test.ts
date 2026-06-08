import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { OpenApi } from "effect/unstable/httpapi";

import type { GooglePlaceIdType } from "./index.js";
import {
  ProximityApi,
  ProximityApiGroup,
  ProximityCostGuardError,
  ProximityLimitSchema,
  ProximityOriginInputSchema,
  ProximityOriginTokenInvalidError,
  RouteDisplayLineSchema,
  RouteSummarySchema,
  signProximityOriginToken,
  verifyProximityOriginToken,
} from "./index.js";

describe("proximity-core", () => {
  it("decodes current-location and typed-origin inputs as strict discriminated unions", async () => {
    const decodeOrigin = Schema.decodeUnknownSync(ProximityOriginInputSchema);
    const placeId = "ChIJL6wn6oAOZ0gRoHExl6nHAAo" as GooglePlaceIdType;

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

    const typedOrigin = {
      coordinates: { latitude: 53.342_886, longitude: -6.267_428 },
      displayText: "Dublin 8",
      mode: "typed_origin" as const,
      originToken: await signProximityOriginToken({
        now: new Date("2026-06-07T10:00:00.000Z"),
        origin: {
          coordinates: { latitude: 53.342_886, longitude: -6.267_428 },
          displayText: "Dublin 8",
          mode: "typed_origin",
          placeId,
        },
        secret: "origin-secret",
        ttlSeconds: 300,
      }),
      placeId,
    };

    expect(decodeOrigin(typedOrigin).mode).toBe("typed_origin");

    expect(() =>
      decodeOrigin({
        coordinates: { latitude: 53.342_886, longitude: -6.267_428 },
        displayText: "Dublin 8",
        mode: "typed_origin",
        placeId,
      })
    ).toThrow(/originToken/);

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
        placeId,
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

  it("signs typed origins and rejects tampered or expired origin tokens", async () => {
    const placeId = "ChIJL6wn6oAOZ0gRoHExl6nHAAo" as GooglePlaceIdType;
    const origin = {
      coordinates: { latitude: 53.342_886, longitude: -6.267_428 },
      displayText: "Dublin 8",
      mode: "typed_origin" as const,
      placeId,
    };
    const token = await signProximityOriginToken({
      now: new Date("2026-06-07T10:00:00.000Z"),
      origin,
      secret: "origin-secret",
      ttlSeconds: 60,
    });

    await expect(
      verifyProximityOriginToken({
        now: new Date("2026-06-07T10:00:30.000Z"),
        origin,
        secret: "origin-secret",
        token,
      })
    ).resolves.toBeUndefined();
    await expect(
      verifyProximityOriginToken({
        now: new Date("2026-06-07T10:00:30.000Z"),
        origin: {
          ...origin,
          coordinates: { ...origin.coordinates, latitude: 53.35 },
        },
        secret: "origin-secret",
        token,
      })
    ).rejects.toBeInstanceOf(ProximityOriginTokenInvalidError);
    await expect(
      verifyProximityOriginToken({
        now: new Date("2026-06-07T10:02:00.000Z"),
        origin,
        secret: "origin-secret",
        token,
      })
    ).rejects.toBeInstanceOf(ProximityOriginTokenInvalidError);
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
