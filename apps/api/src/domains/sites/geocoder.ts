import {
  IsoDateTimeString as IsoDateTimeStringSchema,
  SiteGeocodingFailedError,
  SiteLatitudeSchema,
  SiteLongitudeSchema,
} from "@ceird/sites-core";
import type {
  CreateSiteInput,
  IsoDateTimeStringType,
  SiteGeocodingProvider,
  SiteLatitude,
  SiteLongitude,
} from "@ceird/sites-core";
import { Duration, Effect, Layer, Schema } from "effect";

import {
  loadGoogleGeocodingRequestTimeoutMs,
  loadGoogleMapsApiKey,
  loadSiteGeocodingConfig,
} from "./geocoding-config.js";

const GOOGLE_GEOCODING_URL =
  "https://maps.googleapis.com/maps/api/geocode/json";
const SITE_GEOCODING_FAILED_MESSAGE =
  "We could not locate that site address. Check the Eircode and address details.";

const GoogleGeocodeLocationSchema = Schema.Struct({
  lat: SiteLatitudeSchema,
  lng: SiteLongitudeSchema,
});

const GoogleGeocodeResultSchema = Schema.Struct({
  geometry: Schema.Struct({
    location: GoogleGeocodeLocationSchema,
  }),
});

const GoogleGeocodeResponseSchema = Schema.Struct({
  results: Schema.optional(Schema.Array(Schema.Unknown)),
  status: Schema.String,
});

const decodeGoogleGeocodeResponse = Schema.decodeUnknown(
  GoogleGeocodeResponseSchema
);
const decodeGoogleGeocodeResult = Schema.decodeUnknown(
  GoogleGeocodeResultSchema
);
const decodeIsoDateTimeString = Schema.decodeUnknownSync(
  IsoDateTimeStringSchema
);

export interface GeocodedSiteLocation {
  readonly latitude: SiteLatitude;
  readonly longitude: SiteLongitude;
  readonly provider: SiteGeocodingProvider;
  readonly geocodedAt: IsoDateTimeStringType;
}

export interface SiteGeocoderImplementation {
  readonly geocode: (
    input: CreateSiteInput
  ) => Effect.Effect<GeocodedSiteLocation, SiteGeocodingFailedError>;
}

function makeSiteGeocodingFailedError(input: CreateSiteInput) {
  return new SiteGeocodingFailedError({
    country: input.country,
    eircode: input.eircode,
    message: SITE_GEOCODING_FAILED_MESSAGE,
  });
}

function serializeFailureCause(cause: unknown) {
  if (cause instanceof Error) {
    return cause.message;
  }

  return String(cause);
}

function logAndFailSiteGeocoding(
  input: CreateSiteInput,
  details: {
    readonly cause?: unknown;
    readonly httpStatus?: number;
    readonly reason: string;
    readonly providerStatus?: string;
    readonly requestTimeoutMs?: number;
  }
) {
  return Effect.logWarning("Site geocoding provider failed", {
    ...(details.cause === undefined
      ? {}
      : { failureCause: serializeFailureCause(details.cause) }),
    ...(details.httpStatus === undefined
      ? {}
      : { httpStatus: details.httpStatus }),
    provider: "google",
    ...(details.providerStatus === undefined
      ? {}
      : { providerStatus: details.providerStatus }),
    reason: details.reason,
    ...(details.requestTimeoutMs === undefined
      ? {}
      : { requestTimeoutMs: details.requestTimeoutMs }),
    siteCountry: input.country,
  }).pipe(Effect.zipRight(Effect.fail(makeSiteGeocodingFailedError(input))));
}

type PortableFetch = (
  input: URL,
  init?: Pick<RequestInit, "signal">
) => Promise<Response>;

type GoogleGeocodingRequestFailure =
  | {
      readonly _tag: "GoogleGeocodingFetchFailed";
      readonly cause: unknown;
    }
  | {
      readonly _tag: "GoogleGeocodingJsonDecodeFailed";
      readonly cause: unknown;
    }
  | {
      readonly _tag: "GoogleGeocodingTimedOut";
      readonly requestTimeoutMs: number;
    };

type GoogleGeocodingRequestResult =
  | {
      readonly _tag: "Success";
      readonly payload: unknown;
    }
  | {
      readonly _tag: "HttpError";
      readonly status: number;
    };

function googleRequestFailureDetails(failure: GoogleGeocodingRequestFailure) {
  switch (failure._tag) {
    case "GoogleGeocodingFetchFailed": {
      return {
        cause: failure.cause,
        reason: "fetch_failed",
      };
    }
    case "GoogleGeocodingJsonDecodeFailed": {
      return {
        cause: failure.cause,
        reason: "json_decode_failed",
      };
    }
    case "GoogleGeocodingTimedOut": {
      return {
        reason: "request_timeout",
        requestTimeoutMs: failure.requestTimeoutMs,
      };
    }
    default: {
      return failure satisfies never;
    }
  }
}

function fetchGoogleGeocodingPayload(options: {
  readonly fetchImplementation: PortableFetch;
  readonly requestTimeoutMs: number;
  readonly url: URL;
}) {
  return Effect.acquireUseRelease(
    Effect.sync(() => new AbortController()),
    (controller) =>
      Effect.gen(function* fetchGoogleGeocodingPayloadEffect() {
        const response = yield* Effect.tryPromise({
          try: () =>
            options.fetchImplementation(options.url, {
              signal: controller.signal,
            }),
          catch: (cause) =>
            ({
              _tag: "GoogleGeocodingFetchFailed",
              cause,
            }) satisfies GoogleGeocodingRequestFailure,
        });

        if (!response.ok) {
          return {
            _tag: "HttpError",
            status: response.status,
          } satisfies GoogleGeocodingRequestResult;
        }

        const payload = yield* Effect.tryPromise({
          try: () => response.json() as Promise<unknown>,
          catch: (cause) =>
            ({
              _tag: "GoogleGeocodingJsonDecodeFailed",
              cause,
            }) satisfies GoogleGeocodingRequestFailure,
        });

        return {
          _tag: "Success",
          payload,
        } satisfies GoogleGeocodingRequestResult;
      }).pipe(
        Effect.timeoutFail({
          duration: Duration.millis(options.requestTimeoutMs),
          onTimeout: () =>
            ({
              _tag: "GoogleGeocodingTimedOut",
              requestTimeoutMs: options.requestTimeoutMs,
            }) satisfies GoogleGeocodingRequestFailure,
        })
      ),
    (controller) => Effect.sync(() => controller.abort())
  );
}

const UINT32_RANGE = 4_294_967_296;

function toUint32(value: number) {
  return ((value % UINT32_RANGE) + UINT32_RANGE) % UINT32_RANGE;
}

function xorUint32(left: number, right: number) {
  let result = 0;
  let placeValue = 1;
  let remainingLeft = left;
  let remainingRight = right;

  while (remainingLeft > 0 || remainingRight > 0) {
    const leftBit = remainingLeft % 2;
    const rightBit = remainingRight % 2;

    if (leftBit !== rightBit) {
      result += placeValue;
    }

    remainingLeft = Math.floor(remainingLeft / 2);
    remainingRight = Math.floor(remainingRight / 2);
    placeValue *= 2;
  }

  return result;
}

function stableHash(value: string) {
  let hash = 2_166_136_261;

  for (const character of value) {
    hash = xorUint32(hash, character.codePointAt(0) ?? 0);
    hash = toUint32(Math.imul(hash, 16_777_619));
  }

  return hash;
}

function normalizeAddressPart(value: string | undefined) {
  return value?.trim().replaceAll(/\s+/g, " ");
}

function countryName(country: CreateSiteInput["country"]) {
  return country === "IE" ? "Ireland" : "United Kingdom";
}

function googleRegionBias(country: CreateSiteInput["country"]) {
  return country === "IE" ? "ie" : "uk";
}

function buildAddress(input: CreateSiteInput) {
  return [
    input.addressLine1,
    input.addressLine2,
    input.town,
    input.county,
    input.eircode,
    countryName(input.country),
  ]
    .map(normalizeAddressPart)
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join(", ");
}

function nowIsoString() {
  return decodeIsoDateTimeString(new Date().toISOString());
}

export function makeStubSiteGeocoder(): SiteGeocoderImplementation {
  const geocode = Effect.fn("SiteGeocoder.Stub.geocode")(
    (input: CreateSiteInput) =>
      Effect.sync(() => {
        const hash = stableHash(buildAddress(input).toLowerCase());
        const latitude = 49 + (hash % 1_000_000) / 100_000;
        const longitude =
          -11 + (Math.floor(hash / 1_000_000) % 1_300_000) / 100_000;

        return {
          geocodedAt: nowIsoString(),
          latitude,
          longitude,
          provider: "stub",
        } satisfies GeocodedSiteLocation;
      })
  );

  return { geocode };
}

export function makeGoogleSiteGeocoder(
  options: {
    readonly fetch?: PortableFetch;
    readonly googleMapsApiKey?: string;
    readonly requestTimeoutMs?: number;
  } = {}
) {
  return Effect.gen(function* makeGoogleSiteGeocoderEffect() {
    const googleMapsApiKey =
      options.googleMapsApiKey ?? (yield* loadGoogleMapsApiKey);
    const requestTimeoutMs =
      options.requestTimeoutMs ?? (yield* loadGoogleGeocodingRequestTimeoutMs);
    const fetchImplementation = options.fetch ?? globalThis.fetch;

    const geocode = Effect.fn("SiteGeocoder.Google.geocode")(function* geocode(
      input: CreateSiteInput
    ) {
      const url = new URL(GOOGLE_GEOCODING_URL);
      url.searchParams.set("address", buildAddress(input));
      url.searchParams.set("region", googleRegionBias(input.country));
      url.searchParams.set("key", googleMapsApiKey);

      const requestResult = yield* fetchGoogleGeocodingPayload({
        fetchImplementation,
        requestTimeoutMs,
        url,
      }).pipe(
        Effect.catchTags({
          GoogleGeocodingFetchFailed: (failure) =>
            logAndFailSiteGeocoding(
              input,
              googleRequestFailureDetails(failure)
            ),
          GoogleGeocodingJsonDecodeFailed: (failure) =>
            logAndFailSiteGeocoding(
              input,
              googleRequestFailureDetails(failure)
            ),
          GoogleGeocodingTimedOut: (failure) =>
            logAndFailSiteGeocoding(
              input,
              googleRequestFailureDetails(failure)
            ),
        })
      );

      if (requestResult._tag === "HttpError") {
        return yield* logAndFailSiteGeocoding(input, {
          httpStatus: requestResult.status,
          reason: "http_error",
        });
      }

      const decoded = yield* decodeGoogleGeocodeResponse(
        requestResult.payload
      ).pipe(
        Effect.catchTag("ParseError", (cause) =>
          logAndFailSiteGeocoding(input, {
            cause,
            reason: "response_parse_failed",
          })
        )
      );

      if (decoded.status === "ZERO_RESULTS") {
        return yield* logAndFailSiteGeocoding(input, {
          providerStatus: decoded.status,
          reason: "zero_results",
        });
      }

      if (decoded.status !== "OK") {
        return yield* logAndFailSiteGeocoding(input, {
          providerStatus: decoded.status,
          reason: "provider_status_not_ok",
        });
      }

      const firstResult = decoded.results?.[0];

      if (firstResult === undefined) {
        return yield* logAndFailSiteGeocoding(input, {
          providerStatus: decoded.status,
          reason: "first_result_missing",
        });
      }

      const location = yield* decodeGoogleGeocodeResult(firstResult).pipe(
        Effect.map((result) => result.geometry.location),
        Effect.catchTag("ParseError", (cause) =>
          logAndFailSiteGeocoding(input, {
            cause,
            providerStatus: decoded.status,
            reason: "first_result_parse_failed",
          })
        )
      );

      return {
        geocodedAt: nowIsoString(),
        latitude: location.lat,
        longitude: location.lng,
        provider: "google",
      } satisfies GeocodedSiteLocation;
    });

    return { geocode } satisfies SiteGeocoderImplementation;
  });
}

export class SiteGeocoder extends Effect.Service<SiteGeocoder>()(
  "@ceird/domains/sites/SiteGeocoder",
  {
    accessors: true,
    effect: Effect.gen(function* SiteGeocoderLive() {
      const config = yield* loadSiteGeocodingConfig;

      if (config.mode === "stub") {
        return makeStubSiteGeocoder();
      }

      return yield* makeGoogleSiteGeocoder({
        googleMapsApiKey: config.googleMapsApiKey,
        requestTimeoutMs: config.requestTimeoutMs,
      });
    }),
  }
) {
  static readonly Stub = Layer.succeed(
    SiteGeocoder,
    SiteGeocoder.make(makeStubSiteGeocoder())
  );
}
