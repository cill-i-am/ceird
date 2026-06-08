import { decodeOrganizationId, decodeUserId } from "@ceird/identity-core";
import {
  ProximityCostGuardError,
  ProximityProviderError,
} from "@ceird/proximity-core";
import type { ProximityCoordinates } from "@ceird/proximity-core";
import { describe, expect, it } from "@effect/vitest";
import { Duration, Effect } from "effect";

import {
  configProviderFromMap,
  effectEither,
  withConfigProvider,
} from "../../test/effect-test-helpers.js";
import {
  makeGoogleRoutesProvider,
  makeGoogleRoutesProviderFromConfig,
  makeInMemoryRouteCostGuard,
  makeTestRouteProvider,
  RouteProvider,
} from "./route-provider.js";

const GOOGLE_MAPS_API_KEY = "test-google-routes-key";
const origin = {
  latitude: 53.3498,
  longitude: -6.2603,
} satisfies ProximityCoordinates;
const destinationA = {
  coordinates: {
    latitude: 53.3478,
    longitude: -6.1956,
  },
  destinationId: "job-a",
} as const;
const destinationB = {
  coordinates: {
    latitude: 53.355,
    longitude: -6.23,
  },
  destinationId: "job-b",
} as const;
const context = {
  actorUserId: decodeUserId("user_123"),
  organizationId: decodeOrganizationId("org_123"),
} as const;

type TestGoogleFetch = NonNullable<
  Parameters<typeof makeGoogleRoutesProvider>[0]["fetch"]
>;

function responseWithJson(payload: unknown, ok = true, status = 200): Response {
  return {
    json: () => Promise.resolve(payload),
    ok,
    status,
  } as Response;
}

describe("Google Routes provider", () => {
  it("ranks destinations by traffic-aware driving duration and caches provider work", async () => {
    const requests: Request[] = [];
    const provider = await Effect.runPromise(
      makeGoogleRoutesProvider({
        fetch: (input, init) => {
          const request = new Request(input, init);
          requests.push(request);

          return Promise.resolve(
            responseWithJson([
              {
                condition: "ROUTE_EXISTS",
                destinationIndex: 1,
                distanceMeters: 1100,
                duration: "80s",
                originIndex: 0,
                status: {},
              },
              {
                condition: "ROUTE_EXISTS",
                destinationIndex: 0,
                distanceMeters: 2200,
                duration: "120s",
                originIndex: 0,
                status: {},
              },
            ])
          );
        },
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      })
    );

    const input = {
      context,
      destinations: [destinationA, destinationB],
      origin,
    };
    const firstResult = await Effect.runPromise(provider.rankRoutes(input));
    const secondResult = await Effect.runPromise(provider.rankRoutes(input));

    expect(requests).toHaveLength(1);
    expect(firstResult).toEqual(secondResult);
    expect(firstResult.rows.map((row) => row.destinationId)).toEqual([
      "job-b",
      "job-a",
    ]);
    expect(firstResult.rows[0]?.routeSummary).toMatchObject({
      distanceMeters: 1100,
      durationSeconds: 80,
      provider: "google_routes",
      providerRequestKind: "matrix",
      routeStatus: "ok",
      trafficAware: true,
    });
    expect(firstResult.unavailableDestinationIds).toEqual([]);

    const request = expectFirst(requests, "route matrix request");
    expect(request.url).toBe(
      "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
    );
    expect(request.headers.get("X-Goog-Api-Key")).toBe(GOOGLE_MAPS_API_KEY);
    expect(request.headers.get("X-Goog-FieldMask")).toBe(
      "originIndex,destinationIndex,status,condition,distanceMeters,duration"
    );
    expect(await request.json()).toEqual({
      destinations: [
        {
          waypoint: {
            location: {
              latLng: {
                latitude: destinationA.coordinates.latitude,
                longitude: destinationA.coordinates.longitude,
              },
            },
          },
        },
        {
          waypoint: {
            location: {
              latLng: {
                latitude: destinationB.coordinates.latitude,
                longitude: destinationB.coordinates.longitude,
              },
            },
          },
        },
      ],
      origins: [
        {
          waypoint: {
            location: {
              latLng: {
                latitude: origin.latitude,
                longitude: origin.longitude,
              },
            },
          },
        },
      ],
      routingPreference: "TRAFFIC_AWARE",
      travelMode: "DRIVE",
    });
  });

  it("fetches a traffic-aware route preview with an encoded display line", async () => {
    const requests: Request[] = [];
    const provider = await Effect.runPromise(
      makeGoogleRoutesProvider({
        fetch: (input, init) => {
          const request = new Request(input, init);
          requests.push(request);

          return Promise.resolve(
            responseWithJson({
              routes: [
                {
                  distanceMeters: 4200,
                  duration: "840s",
                  polyline: { encodedPolyline: "encoded-route-line" },
                },
              ],
            })
          );
        },
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      })
    );

    const result = await Effect.runPromise(
      provider.previewRoute({
        context,
        destination: destinationA,
        includeLine: true,
        origin,
      })
    );

    expect(result.routeSummary).toMatchObject({
      distanceMeters: 4200,
      durationSeconds: 840,
      provider: "google_routes",
      providerRequestKind: "route_preview",
      routeStatus: "ok",
      trafficAware: true,
    });
    expect(result.line).toEqual({
      encodedPolyline: "encoded-route-line",
      format: "encoded_polyline",
    });

    const request = expectFirst(requests, "route preview request");
    expect(request.url).toBe(
      "https://routes.googleapis.com/directions/v2:computeRoutes"
    );
    expect(request.headers.get("X-Goog-FieldMask")).toBe(
      "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"
    );
    expect(await request.json()).toMatchObject({
      destination: {
        location: {
          latLng: {
            latitude: destinationA.coordinates.latitude,
            longitude: destinationA.coordinates.longitude,
          },
        },
      },
      origin: {
        location: {
          latLng: {
            latitude: origin.latitude,
            longitude: origin.longitude,
          },
        },
      },
      polylineEncoding: "ENCODED_POLYLINE",
      polylineQuality: "OVERVIEW",
      routingPreference: "TRAFFIC_AWARE",
      travelMode: "DRIVE",
    });
  });

  it("prefers GOOGLE_MAPS_ROUTES_API_KEY and falls back to GOOGLE_MAPS_API_KEY", async () => {
    const requests: Request[] = [];
    const provider = await Effect.runPromise(
      makeGoogleRoutesProviderFromConfig({
        fetch: (input, init) => {
          requests.push(new Request(input, init));

          return Promise.resolve(
            responseWithJson({
              routes: [
                {
                  distanceMeters: 1000,
                  duration: "300s",
                  polyline: { encodedPolyline: "encoded-route-line" },
                },
              ],
            })
          );
        },
      }).pipe(
        withConfigProvider(
          configProviderFromMap(
            new Map([
              ["GOOGLE_MAPS_API_KEY", "fallback-google-key"],
              ["GOOGLE_MAPS_ROUTES_API_KEY", "routes-google-key"],
            ])
          )
        )
      )
    );

    await Effect.runPromise(
      provider.previewRoute({
        context,
        destination: destinationA,
        includeLine: true,
        origin,
      })
    );

    expect(
      expectFirst(requests, "configured route request").headers.get(
        "X-Goog-Api-Key"
      )
    ).toBe("routes-google-key");

    const fallbackRequests: Request[] = [];
    const fallbackProvider = await Effect.runPromise(
      makeGoogleRoutesProviderFromConfig({
        fetch: (input, init) => {
          fallbackRequests.push(new Request(input, init));

          return Promise.resolve(
            responseWithJson({
              routes: [
                {
                  distanceMeters: 1000,
                  duration: "300s",
                  polyline: { encodedPolyline: "encoded-route-line" },
                },
              ],
            })
          );
        },
      }).pipe(
        withConfigProvider(
          configProviderFromMap(
            new Map([["GOOGLE_MAPS_API_KEY", "fallback-google-key"]])
          )
        )
      )
    );

    await Effect.runPromise(
      fallbackProvider.previewRoute({
        context,
        destination: destinationA,
        includeLine: true,
        origin,
      })
    );

    expect(
      expectFirst(fallbackRequests, "fallback route request").headers.get(
        "X-Goog-Api-Key"
      )
    ).toBe("fallback-google-key");
  });

  it("expires failed provider work quickly", async () => {
    const requests: Request[] = [];
    let shouldFail = true;
    const provider = await Effect.runPromise(
      makeGoogleRoutesProvider({
        cacheFailureTtl: Duration.millis(5),
        fetch: (input, init) => {
          requests.push(new Request(input, init));

          if (shouldFail) {
            return Promise.resolve(
              responseWithJson(
                {
                  error: {
                    message: "temporarily unavailable",
                    status: "UNAVAILABLE",
                  },
                },
                false,
                503
              )
            );
          }

          return Promise.resolve(
            responseWithJson([
              {
                condition: "ROUTE_EXISTS",
                destinationIndex: 0,
                distanceMeters: 900,
                duration: "90s",
                originIndex: 0,
                status: {},
              },
            ])
          );
        },
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      })
    );

    const input = {
      context,
      destinations: [destinationA],
      origin,
    };
    const firstResult = await Effect.runPromise(
      provider.rankRoutes(input).pipe(effectEither)
    );
    const secondResult = await Effect.runPromise(
      provider.rankRoutes(input).pipe(effectEither)
    );
    shouldFail = false;
    await Effect.runPromise(Effect.sleep(Duration.millis(10)));
    const thirdResult = await Effect.runPromise(
      provider.rankRoutes(input).pipe(effectEither)
    );

    expect(firstResult._tag).toBe("Left");
    expect(secondResult._tag).toBe("Left");
    expect(thirdResult._tag).toBe("Right");
    expect(requests).toHaveLength(2);
  });

  it("blocks over-budget route work before calling Google", async () => {
    const requests: Request[] = [];
    const provider = await Effect.runPromise(
      makeGoogleRoutesProvider({
        costGuard: makeInMemoryRouteCostGuard({
          actorLimit: 1,
          agentThreadLimit: 100,
          organizationLimit: 100,
          window: Duration.seconds(60),
        }),
        fetch: ((input, init) => {
          requests.push(new Request(input, init));

          return Promise.resolve(responseWithJson([]));
        }) satisfies TestGoogleFetch,
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      })
    );

    const result = await Effect.runPromise(
      provider
        .rankRoutes({
          context,
          destinations: [destinationA, destinationB],
          origin,
        })
        .pipe(effectEither)
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ProximityCostGuardError);
      expect(result.left).toMatchObject({
        limit: 1,
        scope: "actor",
      });
      expect(result.left.retryAfterSeconds).toBeGreaterThan(0);
    }
    expect(requests).toHaveLength(0);
  });

  it("charges provider work only on cache misses", async () => {
    const requests: Request[] = [];
    const provider = await Effect.runPromise(
      makeGoogleRoutesProvider({
        costGuard: makeInMemoryRouteCostGuard({
          actorLimit: 1,
          agentThreadLimit: 100,
          organizationLimit: 100,
          window: Duration.seconds(60),
        }),
        fetch: (input, init) => {
          requests.push(new Request(input, init));

          return Promise.resolve(
            responseWithJson({
              routes: [
                {
                  distanceMeters: 1000,
                  duration: "300s",
                  polyline: { encodedPolyline: "encoded-route-line" },
                },
              ],
            })
          );
        },
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      })
    );

    const input = {
      context,
      destination: destinationA,
      includeLine: true,
      origin,
    };
    const firstResult = await Effect.runPromise(
      provider.previewRoute(input).pipe(effectEither)
    );
    const secondResult = await Effect.runPromise(
      provider.previewRoute(input).pipe(effectEither)
    );

    expect(firstResult._tag).toBe("Right");
    expect(secondResult._tag).toBe("Right");
    expect(requests).toHaveLength(1);
  });

  it("shares the Google provider cache across default layer builds for the same key", async () => {
    const requests: Request[] = [];
    const originalFetch = globalThis.fetch;
    const googleMapsApiKey = "warm-layer-cache-test-key";
    const runRank = Effect.gen(function* () {
      const provider = yield* RouteProvider;

      return yield* provider.rankRoutes({
        context,
        destinations: [destinationA],
        origin,
      });
    }).pipe(
      Effect.provide(RouteProvider.Google),
      withConfigProvider(
        configProviderFromMap(
          new Map([["GOOGLE_MAPS_ROUTES_API_KEY", googleMapsApiKey]])
        )
      )
    );

    globalThis.fetch = ((input, init) => {
      requests.push(new Request(input, init));

      return Promise.resolve(
        responseWithJson([
          {
            condition: "ROUTE_EXISTS",
            destinationIndex: 0,
            distanceMeters: 900,
            duration: "90s",
            originIndex: 0,
            status: {},
          },
        ])
      );
    }) as typeof fetch;

    try {
      const firstResult = await Effect.runPromise(runRank);
      const secondResult = await Effect.runPromise(runRank);

      expect(secondResult).toEqual(firstResult);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.headers.get("X-Goog-Api-Key")).toBe(googleMapsApiKey);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fails lazily with a provider error when route config is missing", async () => {
    const result = await Effect.runPromise(
      RouteProvider.rankRoutes({
        context,
        destinations: [destinationA],
        origin,
      }).pipe(
        Effect.provide(RouteProvider.Google),
        withConfigProvider(configProviderFromMap(new Map())),
        effectEither
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ProximityProviderError);
      expect(result.left).toMatchObject({
        message: "Google Routes provider is not configured",
        provider: "google_routes",
        reason: "configuration_error",
      });
    }
  });

  it("normalizes Google route failures without exposing raw payloads", async () => {
    const provider = await Effect.runPromise(
      makeGoogleRoutesProvider({
        fetch: () =>
          Promise.resolve(
            responseWithJson(
              {
                error: {
                  message:
                    "Route request denied for key=very-secret and precise coordinates",
                  status: "REQUEST_DENIED",
                },
              },
              false,
              403
            )
          ),
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      })
    );

    const result = await Effect.runPromise(
      provider
        .previewRoute({
          context,
          destination: destinationA,
          includeLine: true,
          origin,
        })
        .pipe(effectEither)
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ProximityProviderError);
      expect(result.left).toMatchObject({
        provider: "google_routes",
        reason: "http_error",
      });
      expect(result.left.message).not.toContain("very-secret");
      expect(result.left.message).not.toContain(String(origin.latitude));
      expect(result.left.message).toContain("Google Routes provider failed");
    }
  });
});

describe("Test Routes provider", () => {
  it("ranks destinations deterministically from coordinates", async () => {
    const provider = makeTestRouteProvider();

    const result = await Effect.runPromise(
      provider.rankRoutes({
        context,
        destinations: [destinationA, destinationB],
        origin,
      })
    );

    expect(result.unavailableDestinationIds).toEqual([]);
    expect(result.rows.map((row) => row.destinationId)).toEqual([
      "job-b",
      "job-a",
    ]);
    expect(result.rows[0]?.routeSummary).toMatchObject({
      provider: "test",
      providerRequestKind: "matrix",
      routeStatus: "ok",
      trafficAware: false,
    });
  });

  it("returns a simple GeoJSON display line for preview requests", async () => {
    const provider = makeTestRouteProvider();

    const result = await Effect.runPromise(
      provider.previewRoute({
        context,
        destination: destinationA,
        includeLine: true,
        origin,
      })
    );

    expect(result.routeSummary).toMatchObject({
      provider: "test",
      providerRequestKind: "route_line",
      routeStatus: "ok",
      trafficAware: false,
    });
    expect(result.line).toMatchObject({
      format: "geojson_linestring",
    });
  });

  it("is selected by the configured provider layer when CEIRD_ROUTE_PROVIDER=test", async () => {
    const result = await Effect.runPromise(
      RouteProvider.rankRoutes({
        context,
        destinations: [destinationA],
        origin,
      }).pipe(
        Effect.provide(RouteProvider.Configured),
        withConfigProvider(
          configProviderFromMap(new Map([["CEIRD_ROUTE_PROVIDER", "test"]]))
        )
      )
    );

    expect(result.rows[0]?.routeSummary.provider).toBe("test");
  });
});

function expectFirst<Value>(values: readonly Value[], label: string): Value {
  const [value] = values;
  expect(value, `Expected ${label}`).toBeDefined();

  if (value === undefined) {
    throw new Error(`Expected ${label}`);
  }

  return value;
}
