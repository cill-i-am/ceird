import type {
  GooglePlaceIdType,
  GooglePlacesSessionTokenType,
  IsoDateTimeStringType,
  SiteLatitude,
  SiteLongitude,
} from "@ceird/sites-core";
import {
  SiteLocationProviderError,
  SiteLocationResolutionError,
} from "@ceird/sites-core";
import { describe, expect, it } from "@effect/vitest";
import { Duration, Effect } from "effect";

import {
  configProviderFromMap,
  effectEither,
  withConfigProvider,
} from "../../test/effect-test-helpers.js";
import {
  makeGoogleSiteLocationProvider,
  SiteLocationProvider,
} from "./location-provider.js";

const GOOGLE_MAPS_API_KEY = "test-google-key";
const sessionToken =
  "550e8400-e29b-41d4-a716-446655440000" as GooglePlacesSessionTokenType;

type TestGoogleFetch = NonNullable<
  Parameters<typeof makeGoogleSiteLocationProvider>[0]["fetch"]
>;

function responseWithJson(payload: unknown, ok = true, status = 200): Response {
  return {
    json: () => Promise.resolve(payload),
    ok,
    status,
  } as Response;
}

describe("site location provider", () => {
  it("development provider returns deterministic suggestions and details", async () => {
    const suggestions = await Effect.runPromise(
      SiteLocationProvider.autocomplete({
        input: "dub port",
        sessionToken,
      }).pipe(Effect.provide(SiteLocationProvider.Development))
    );

    expect(suggestions.suggestions[0]).toMatchObject({
      displayText: "dub port",
      placeId: expect.stringContaining("dev-"),
    });

    const suggestion = expectFirst(suggestions.suggestions, "suggestion");
    const details = await Effect.runPromise(
      SiteLocationProvider.resolvePlace({
        placeId: suggestion.placeId,
        rawInput: "dub port",
        sessionToken,
      }).pipe(Effect.provide(SiteLocationProvider.Development))
    );

    expect(details).toMatchObject({
      displayLocation: "dub port",
      formattedAddress: "dub port",
      locationProvider: "stub",
      locationStatus: "google_resolved",
      rawLocationInput: "dub port",
    });
    expect(Date.parse(details.locationResolvedAt)).not.toBeNaN();
    expect(details.latitude).toBeGreaterThanOrEqual(-90);
    expect(details.latitude).toBeLessThanOrEqual(90);
    expect(details.longitude).toBeGreaterThanOrEqual(-180);
    expect(details.longitude).toBeLessThanOrEqual(180);
  });

  it("local provider uses development behavior without a Google key", async () => {
    const suggestions = await Effect.runPromise(
      SiteLocationProvider.autocomplete({
        input: "yard",
        sessionToken,
      }).pipe(
        Effect.provide(SiteLocationProvider.Local),
        withConfigProvider(configProviderFromMap(new Map()))
      )
    );

    expect(suggestions.suggestions[0]?.placeId).toContain("dev-");
  });

  it("calls Google Places autocomplete with a session token and field mask", async () => {
    const requests: Request[] = [];
    const provider = await Effect.runPromise(
      makeGoogleSiteLocationProvider({
        fetch: (input, init) => {
          const request = new Request(input, init);
          requests.push(request);

          return Promise.resolve(
            responseWithJson({
              suggestions: [
                {
                  placePrediction: {
                    placeId: "ChIJabc",
                    structuredFormat: {
                      mainText: { text: "Dublin Port" },
                      secondaryText: { text: "Dublin, Ireland" },
                    },
                  },
                },
              ],
            })
          );
        },
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      })
    );

    const result = await Effect.runPromise(
      provider.autocomplete({
        country: "IE",
        input: "dub port",
        sessionToken,
      })
    );

    expect(result.suggestions).toEqual([
      {
        displayText: "Dublin Port",
        placeId: "ChIJabc",
        secondaryText: "Dublin, Ireland",
      },
    ]);
    const request = expectFirst(requests, "autocomplete request");
    expect(request.url).toBe(
      "https://places.googleapis.com/v1/places:autocomplete"
    );
    expect(request.headers.get("X-Goog-Api-Key")).toBe(GOOGLE_MAPS_API_KEY);
    expect(request.headers.get("X-Goog-FieldMask")).toBe(
      "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat"
    );
    expect(await request.json()).toMatchObject({
      includedRegionCodes: ["ie"],
      input: "dub port",
      sessionToken,
    });
  });

  it("calls Google Place Details with a session token and narrow field mask", async () => {
    const requests: Request[] = [];
    const provider = await Effect.runPromise(
      makeGoogleSiteLocationProvider({
        fetch: (input, init) => {
          const request = new Request(input, init);
          requests.push(request);

          return Promise.resolve(
            responseWithJson({
              addressComponents: [
                {
                  languageCode: "en",
                  longText: "Dublin",
                  shortText: "Dublin",
                  types: ["locality", "political"],
                },
              ],
              formattedAddress: "Dublin Port, Dublin, Ireland",
              id: "ChIJabc",
              location: { latitude: 53.3478, longitude: -6.1956 },
            })
          );
        },
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      })
    );

    const result = await Effect.runPromise(
      provider.resolvePlace({
        placeId: "ChIJabc" as GooglePlaceIdType,
        rawInput: "dub port",
        sessionToken,
      })
    );

    expect(result).toMatchObject({
      displayLocation: "Dublin Port, Dublin, Ireland",
      googlePlaceId: "ChIJabc",
      latitude: 53.3478 as SiteLatitude,
      locationProvider: "google_places",
      locationStatus: "google_resolved",
      longitude: -6.1956 as SiteLongitude,
      rawLocationInput: "dub port",
    });
    expect(result.locationResolvedAt).toEqual(
      expect.any(String) as IsoDateTimeStringType
    );
    const request = expectFirst(requests, "place details request");
    expect(request.url).toBe(
      `https://places.googleapis.com/v1/places/ChIJabc?sessionToken=${sessionToken}`
    );
    expect(request.headers.get("X-Goog-FieldMask")).toBe(
      "id,formattedAddress,addressComponents,location"
    );
  });

  it("fails unresolved details with SiteLocationResolutionError", async () => {
    const provider = await Effect.runPromise(
      makeGoogleSiteLocationProvider({
        fetch: () => Promise.resolve(responseWithJson({ id: "ChIJabc" })),
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      })
    );

    const result = await Effect.runPromise(
      provider
        .resolvePlace({
          placeId: "ChIJabc" as GooglePlaceIdType,
          rawInput: "dub port",
          sessionToken,
        })
        .pipe(effectEither)
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(SiteLocationResolutionError);
      expect(result.left).toMatchObject({
        operation: "place_details",
        placeId: "ChIJabc",
        provider: "google_places",
      });
    }
  });

  it("fails non-OK responses with sanitized Google error details", async () => {
    const provider = await Effect.runPromise(
      makeGoogleSiteLocationProvider({
        fetch: () =>
          Promise.resolve(
            responseWithJson(
              {
                error: {
                  message:
                    "API key denied: https://example.test?key=very-secret",
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
        .autocomplete({
          input: "dub port",
          sessionToken,
        })
        .pipe(effectEither)
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(SiteLocationProviderError);
      expect(result.left).toMatchObject({
        httpStatus: 403,
        operation: "autocomplete",
        provider: "google_places",
        providerStatus: "REQUEST_DENIED",
      });
      expect(result.left.providerMessage).toContain("key=[redacted]");
      expect(result.left.providerMessage).not.toContain("very-secret");
      expect(result.left.reason).toBe("http_error");
    }
  });

  it("times out stalled Google requests and aborts the fetch", async () => {
    let aborted = false;
    const provider = await Effect.runPromise(
      makeGoogleSiteLocationProvider({
        fetch: ((_input, init) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
          });

          return Effect.runPromise(Effect.never) as Promise<Response>;
        }) satisfies TestGoogleFetch,
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        requestTimeout: Duration.millis(1),
      })
    );

    const result = await Effect.runPromise(
      provider
        .autocomplete({
          input: "dub port",
          sessionToken,
        })
        .pipe(effectEither)
    );

    expect(result._tag).toBe("Left");
    expect(aborted).toBe(true);
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
