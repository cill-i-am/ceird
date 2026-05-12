import {
  SiteGeocodingFailedError,
  SiteGeocodingProviderError,
} from "@ceird/sites-core";
import type { CreateSiteInput } from "@ceird/sites-core";
import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Duration, Effect } from "effect";

import { makeGoogleSiteGeocoder, SiteGeocoder } from "../sites/geocoder.js";

const FAILED_MESSAGE =
  "We could not locate that site address. Check the Eircode and address details.";
const GOOGLE_MAPS_API_KEY = "test-google-key";
type TestGoogleFetch = NonNullable<
  Parameters<typeof makeGoogleSiteGeocoder>[0]["fetch"]
>;

const siteInput = {
  addressLine1: "1 Custom House Quay",
  addressLine2: "IFSC",
  county: "Dublin",
  country: "IE",
  eircode: "D01 W2R1",
  name: "Docklands Campus",
  town: "Dublin",
} satisfies CreateSiteInput;

const gbSiteInput = {
  addressLine1: "10 Downing Street",
  county: "Greater London",
  country: "GB",
  name: "Westminster Office",
  town: "London",
} satisfies CreateSiteInput;

function configProvider(values: ReadonlyMap<string, string>) {
  return ConfigProvider.fromMap(new Map(values));
}

function runWithConfig<Value, Error>(
  effect: Effect.Effect<Value, Error, never>,
  values: ReadonlyMap<string, string>
) {
  return Effect.runPromise(
    effect.pipe(Effect.withConfigProvider(configProvider(values)))
  );
}

function responseWithJson(payload: unknown, ok = true, status = 200): Response {
  return {
    json: () => Promise.resolve(payload),
    ok,
    status,
  } as Response;
}

function makeGoogleTestGeocoder(
  fetchImplementation: TestGoogleFetch,
  options: {
    readonly requestTimeout?: Duration.Duration;
  } = {}
) {
  return makeGoogleSiteGeocoder({
    fetch: fetchImplementation,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    ...options,
  });
}

describe("site geocoder", () => {
  it("development layer resolves deterministic coordinates without Google key", async () => {
    const first = await Effect.runPromise(
      SiteGeocoder.geocode(siteInput).pipe(
        Effect.provide(SiteGeocoder.Development)
      )
    );
    const second = await Effect.runPromise(
      SiteGeocoder.geocode(siteInput).pipe(
        Effect.provide(SiteGeocoder.Development)
      )
    );

    expect(first).toMatchObject({
      latitude: second.latitude,
      longitude: second.longitude,
      provider: "stub",
    });
    expect(first.geocodedAt).toStrictEqual(expect.any(String));
    expect(Date.parse(first.geocodedAt)).not.toBeNaN();
    expect(first.latitude).toBeGreaterThanOrEqual(-90);
    expect(first.latitude).toBeLessThanOrEqual(90);
    expect(first.longitude).toBeGreaterThanOrEqual(-180);
    expect(first.longitude).toBeLessThanOrEqual(180);
  }, 10_000);

  it("local layer resolves deterministic coordinates without Google key", async () => {
    const location = await runWithConfig(
      SiteGeocoder.geocode(siteInput).pipe(Effect.provide(SiteGeocoder.Local)),
      new Map()
    );

    expect(location.provider).toBe("stub");
  }, 10_000);

  it("local layer uses Google geocoding when a Google key is configured", async () => {
    const previousFetch = globalThis.fetch;
    let requestedUrl: URL | undefined;
    globalThis.fetch = ((url: URL) => {
      requestedUrl = url;

      return Promise.resolve(
        responseWithJson({
          results: [
            {
              geometry: {
                location: {
                  lat: 52.478_663_040_036_444,
                  lng: -9.559_573_126_109_493,
                },
              },
            },
          ],
          status: "OK",
        })
      );
    }) as typeof globalThis.fetch;

    try {
      const location = await runWithConfig(
        SiteGeocoder.geocode({
          ...siteInput,
          eircode: "V31 R968",
        }).pipe(Effect.provide(SiteGeocoder.Local)),
        new Map([["GOOGLE_MAPS_API_KEY", GOOGLE_MAPS_API_KEY]])
      );

      expect(location).toMatchObject({
        latitude: 52.478_663_040_036_444,
        longitude: -9.559_573_126_109_493,
        provider: "google",
      });
      expect(requestedUrl?.searchParams.get("key")).toBe(GOOGLE_MAPS_API_KEY);
      expect(requestedUrl?.searchParams.get("address")).toContain("V31 R968");
    } finally {
      globalThis.fetch = previousFetch;
    }
  }, 10_000);

  it("google layer requires a Google Maps API key", async () => {
    const result = await runWithConfig(
      SiteGeocoder.geocode(siteInput).pipe(
        Effect.provide(SiteGeocoder.Google),
        Effect.either
      ),
      new Map()
    );

    expect(result._tag).toBe("Left");
    expect(result._tag === "Left" ? String(result.left) : "").toContain(
      "GOOGLE_MAPS_API_KEY"
    );
  }, 10_000);

  it("google factory rejects a blank Google Maps API key", async () => {
    const fetchImplementation = (() =>
      Promise.resolve(
        responseWithJson({
          results: [],
          status: "ZERO_RESULTS",
        })
      )) satisfies TestGoogleFetch;

    const result = await Effect.runPromise(
      makeGoogleSiteGeocoder({
        fetch: fetchImplementation,
        googleMapsApiKey: "   ",
      }).pipe(Effect.either)
    );

    expect(result._tag).toBe("Left");
    expect(result._tag === "Left" ? String(result.left) : "").toContain(
      "minLength"
    );
  }, 10_000);

  it("google factory rejects request timeouts outside the supported range", async () => {
    const fetchImplementation = (() =>
      Promise.resolve(
        responseWithJson({
          results: [],
          status: "ZERO_RESULTS",
        })
      )) satisfies TestGoogleFetch;

    const result = await Effect.runPromise(
      makeGoogleSiteGeocoder({
        fetch: fetchImplementation,
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        requestTimeout: Duration.zero,
      }).pipe(Effect.either)
    );

    expect(result._tag).toBe("Left");
    expect(result._tag === "Left" ? String(result.left) : "").toContain(
      "betweenDuration"
    );
  }, 10_000);

  it("google layer does not use an env var for request timeout", async () => {
    const result = await runWithConfig(
      Effect.runtime<SiteGeocoder>().pipe(
        Effect.provide(SiteGeocoder.Google),
        Effect.either
      ),
      new Map([
        ["GOOGLE_MAPS_API_KEY", GOOGLE_MAPS_API_KEY],
        ["GOOGLE_GEOCODING_REQUEST_TIMEOUT_MS", "not-a-duration"],
      ])
    );

    expect(result._tag).toBe("Right");
  }, 10_000);

  it("successful Google response maps to latitude/longitude/provider/geocodedAt", async () => {
    let requestedUrl: URL | undefined;
    const fetchImplementation = ((url: URL) => {
      requestedUrl = url;

      return Promise.resolve(
        responseWithJson({
          results: [
            {
              geometry: {
                location: {
                  lat: 53.3498,
                  lng: -6.2603,
                },
              },
            },
          ],
          status: "OK",
        })
      );
    }) satisfies TestGoogleFetch;

    const location = await Effect.runPromise(
      makeGoogleTestGeocoder(fetchImplementation).pipe(
        Effect.flatMap((geocoder) => geocoder.geocode(siteInput))
      )
    );

    expect(location).toMatchObject({
      latitude: 53.3498,
      longitude: -6.2603,
      provider: "google",
    });
    expect(location.geocodedAt).toStrictEqual(expect.any(String));
    expect(Date.parse(location.geocodedAt)).not.toBeNaN();
    expect(requestedUrl).toBeDefined();
    if (requestedUrl === undefined) {
      return;
    }

    expect(requestedUrl.origin + requestedUrl.pathname).toBe(
      "https://maps.googleapis.com/maps/api/geocode/json"
    );
    expect(requestedUrl.searchParams.get("address")).toBe(
      "1 Custom House Quay, IFSC, Dublin, Dublin, D01 W2R1, Ireland"
    );
    expect(requestedUrl.searchParams.get("region")).toBe("ie");
    expect(requestedUrl.searchParams.get("key")).toBe(GOOGLE_MAPS_API_KEY);
  }, 10_000);

  it("google request maps GB to uk region bias and United Kingdom address", async () => {
    let requestedUrl: URL | undefined;
    const fetchImplementation = ((url: URL) => {
      requestedUrl = url;

      return Promise.resolve(
        responseWithJson({
          results: [
            {
              geometry: {
                location: {
                  lat: 51.5034,
                  lng: -0.1276,
                },
              },
            },
          ],
          status: "OK",
        })
      );
    }) satisfies TestGoogleFetch;

    await Effect.runPromise(
      makeGoogleTestGeocoder(fetchImplementation).pipe(
        Effect.flatMap((geocoder) => geocoder.geocode(gbSiteInput))
      )
    );

    expect(requestedUrl).toBeDefined();
    if (requestedUrl === undefined) {
      return;
    }

    expect(requestedUrl.searchParams.get("address")).toBe(
      "10 Downing Street, London, Greater London, United Kingdom"
    );
    expect(requestedUrl.searchParams.get("region")).toBe("uk");
  }, 10_000);

  it("successful google response ignores malformed later results", async () => {
    const fetchImplementation = (() =>
      Promise.resolve(
        responseWithJson({
          results: [
            {
              geometry: {
                location: {
                  lat: 53.3498,
                  lng: -6.2603,
                },
              },
            },
            {
              geometry: {
                location: {
                  lat: 123,
                  lng: "not-a-number",
                },
              },
            },
          ],
          status: "OK",
        })
      )) satisfies TestGoogleFetch;

    const location = await Effect.runPromise(
      makeGoogleTestGeocoder(fetchImplementation).pipe(
        Effect.flatMap((geocoder) => geocoder.geocode(siteInput))
      )
    );

    expect(location).toMatchObject({
      latitude: 53.3498,
      longitude: -6.2603,
      provider: "google",
    });
  }, 10_000);

  it("zero results fails with SiteGeocodingFailedError", async () => {
    const fetchImplementation = (() =>
      Promise.resolve(
        responseWithJson({
          results: [],
          status: "ZERO_RESULTS",
        })
      )) satisfies TestGoogleFetch;

    const result = await Effect.runPromise(
      makeGoogleTestGeocoder(fetchImplementation).pipe(
        Effect.flatMap((geocoder) => geocoder.geocode(siteInput)),
        Effect.either
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(SiteGeocodingFailedError);
    expect(result.left).toMatchObject({
      country: "IE",
      eircode: "D01 W2R1",
      message: FAILED_MESSAGE,
    });
  }, 10_000);

  it("non-OK HTTP response fails with SiteGeocodingProviderError", async () => {
    const fetchImplementation = (() =>
      Promise.resolve(
        responseWithJson({ status: "UNKNOWN_ERROR" }, false, 503)
      )) satisfies TestGoogleFetch;

    const result = await Effect.runPromise(
      makeGoogleTestGeocoder(fetchImplementation).pipe(
        Effect.flatMap((geocoder) => geocoder.geocode(siteInput)),
        Effect.either
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(SiteGeocodingProviderError);
    if (!(result.left instanceof SiteGeocodingProviderError)) {
      return;
    }
    expect(result.left).toMatchObject({
      country: "IE",
      eircode: "D01 W2R1",
      httpStatus: 503,
      reason: "http_error",
    });
  }, 10_000);

  it("provider status failures fail with SiteGeocodingProviderError", async () => {
    const fetchImplementation = (() =>
      Promise.resolve(
        responseWithJson({
          error_message:
            "This API project is not authorized to use this API. key=secret",
          results: [],
          status: "REQUEST_DENIED",
        })
      )) satisfies TestGoogleFetch;

    const result = await Effect.runPromise(
      makeGoogleTestGeocoder(fetchImplementation).pipe(
        Effect.flatMap((geocoder) => geocoder.geocode(siteInput)),
        Effect.either
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(SiteGeocodingProviderError);
    if (!(result.left instanceof SiteGeocodingProviderError)) {
      return;
    }
    expect(result.left).toMatchObject({
      country: "IE",
      eircode: "D01 W2R1",
      providerStatus: "REQUEST_DENIED",
      reason: "provider_status_not_ok",
    });
    expect(result.left.providerMessage).not.toContain("secret");
  }, 10_000);

  it("malformed response fails with SiteGeocodingProviderError", async () => {
    const fetchImplementation = (() =>
      Promise.resolve(
        responseWithJson({
          results: [
            {
              geometry: {
                location: {
                  lat: 123,
                  lng: -6.2603,
                },
              },
            },
          ],
          status: "OK",
        })
      )) satisfies TestGoogleFetch;

    const result = await Effect.runPromise(
      makeGoogleTestGeocoder(fetchImplementation).pipe(
        Effect.flatMap((geocoder) => geocoder.geocode(siteInput)),
        Effect.either
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(SiteGeocodingProviderError);
    expect(result.left).toMatchObject({
      country: "IE",
      eircode: "D01 W2R1",
      reason: "first_result_parse_failed",
    });
  }, 10_000);

  it("provider request failure fails with SiteGeocodingProviderError", async () => {
    const fetchImplementation = (() =>
      Promise.reject(new Error("upstream timeout"))) satisfies TestGoogleFetch;

    const result = await Effect.runPromise(
      makeGoogleTestGeocoder(fetchImplementation).pipe(
        Effect.flatMap((geocoder) => geocoder.geocode(siteInput)),
        Effect.either
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(SiteGeocodingProviderError);
    expect(result.left).toMatchObject({
      country: "IE",
      eircode: "D01 W2R1",
      reason: "fetch_failed",
    });
  }, 10_000);

  it("times out stalled google requests and aborts the fetch", async () => {
    let abortSignal: AbortSignal | undefined;
    let aborted = false;
    const fetchImplementation = ((_url: URL, init?: RequestInit) => {
      abortSignal = init?.signal ?? undefined;
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
      });

      return Promise.race<Response>([]);
    }) satisfies TestGoogleFetch;

    const result = await Effect.runPromise(
      makeGoogleTestGeocoder(fetchImplementation, {
        requestTimeout: Duration.millis(1),
      }).pipe(
        Effect.flatMap((geocoder) => geocoder.geocode(siteInput)),
        Effect.either
      )
    );

    expect(result._tag).toBe("Left");
    expect(result._tag === "Left" ? result.left : undefined).toBeInstanceOf(
      SiteGeocodingProviderError
    );
    expect([aborted, abortSignal?.aborted]).toStrictEqual([true, true]);
  }, 10_000);
});
