import {
  GoogleMapsApiKey as GoogleMapsApiKeySchema,
  IsoDateTimeString as IsoDateTimeStringSchema,
  SiteGeocodingFailedError,
  SiteGeocodingProviderError,
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
import {
  Array as EffectArray,
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  Match,
  Option,
  Redacted,
  Schema,
} from "effect";

const GOOGLE_GEOCODING_URL =
  "https://maps.googleapis.com/maps/api/geocode/json";
const DEFAULT_GOOGLE_GEOCODING_REQUEST_TIMEOUT = Duration.seconds(5);
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
  error_message: Schema.optional(Schema.String),
  results: Schema.optional(Schema.Array(Schema.Unknown)),
  status: Schema.String,
});
const GoogleSiteGeocoderConfigSchema = Schema.Struct({
  googleMapsApiKey: GoogleMapsApiKeySchema,
  requestTimeout: Schema.optionalWith(
    Schema.DurationFromSelf.pipe(
      Schema.betweenDuration(Duration.millis(1), Duration.seconds(60))
    ),
    { default: () => DEFAULT_GOOGLE_GEOCODING_REQUEST_TIMEOUT }
  ),
});

const decodeGoogleGeocodeResponse = Schema.decodeUnknown(
  GoogleGeocodeResponseSchema
);
const decodeGoogleGeocodeResult = Schema.decodeUnknown(
  GoogleGeocodeResultSchema
);
const decodeGoogleSiteGeocoderConfig = Schema.decodeUnknown(
  GoogleSiteGeocoderConfigSchema
);
const decodeIsoDateTimeString = Schema.decodeUnknownSync(
  IsoDateTimeStringSchema
);
const decodeSiteLatitude = Schema.decodeUnknownSync(SiteLatitudeSchema);
const decodeSiteLongitude = Schema.decodeUnknownSync(SiteLongitudeSchema);

export interface GeocodedSiteLocation {
  readonly latitude: SiteLatitude;
  readonly longitude: SiteLongitude;
  readonly provider: SiteGeocodingProvider;
  readonly geocodedAt: IsoDateTimeStringType;
}

export interface SiteGeocoderImplementation {
  readonly geocode: (
    input: CreateSiteInput
  ) => Effect.Effect<
    GeocodedSiteLocation,
    SiteGeocodingFailedError | SiteGeocodingProviderError
  >;
}

function makeSiteGeocodingFailedError(input: CreateSiteInput) {
  return new SiteGeocodingFailedError({
    country: input.country,
    eircode: input.eircode,
    message: SITE_GEOCODING_FAILED_MESSAGE,
  });
}

function makeSiteGeocodingProviderError(
  input: CreateSiteInput,
  details: SiteGeocodingProviderFailureDetails
) {
  return new SiteGeocodingProviderError({
    country: input.country,
    eircode: input.eircode,
    httpStatus: details.httpStatus,
    message: "Site geocoding provider failed",
    providerMessage: details.providerMessage,
    providerStatus: details.providerStatus,
    reason: details.reason,
  });
}

function failureCauseName(cause: unknown) {
  if (cause instanceof Error) {
    return cause.name;
  }

  return typeof cause;
}

function sanitizeProviderMessage(value: string | undefined) {
  return value
    ?.replaceAll(/([?&]key=)[^&\s]+/gi, "$1[redacted]")
    .replaceAll(/\bkey=([^\s&]+)/gi, "key=[redacted]")
    .slice(0, 240);
}

function logAndFailSiteGeocoding(
  input: CreateSiteInput,
  details: {
    readonly cause?: unknown;
    readonly httpStatus?: number;
    readonly reason: string;
    readonly providerStatus?: string;
    readonly requestTimeout?: Duration.Duration;
  }
) {
  return Effect.logWarning("Site geocoding provider failed", {
    ...(details.httpStatus === undefined
      ? {}
      : { httpStatus: details.httpStatus }),
    provider: "google",
    ...(details.providerStatus === undefined
      ? {}
      : { providerStatus: details.providerStatus }),
    reason: details.reason,
    ...(details.requestTimeout === undefined
      ? {}
      : { requestTimeoutMs: Duration.toMillis(details.requestTimeout) }),
    siteCountry: input.country,
  }).pipe(Effect.zipRight(Effect.fail(makeSiteGeocodingFailedError(input))));
}

interface SiteGeocodingProviderFailureDetails {
  readonly cause?: unknown;
  readonly httpStatus?: number;
  readonly providerMessage?: string;
  readonly providerStatus?: string;
  readonly reason: string;
  readonly requestTimeout?: Duration.Duration;
}

function logAndFailSiteGeocodingProvider(
  input: CreateSiteInput,
  details: SiteGeocodingProviderFailureDetails
) {
  return Effect.logWarning("Site geocoding provider failed", {
    ...(details.cause === undefined
      ? {}
      : { failureCauseType: failureCauseName(details.cause) }),
    ...(details.httpStatus === undefined
      ? {}
      : { httpStatus: details.httpStatus }),
    provider: "google",
    ...(details.providerMessage === undefined
      ? {}
      : { providerMessage: sanitizeProviderMessage(details.providerMessage) }),
    ...(details.providerStatus === undefined
      ? {}
      : { providerStatus: details.providerStatus }),
    reason: details.reason,
    ...(details.requestTimeout === undefined
      ? {}
      : { requestTimeoutMs: Duration.toMillis(details.requestTimeout) }),
    siteCountry: input.country,
  }).pipe(
    Effect.zipRight(
      Effect.fail(
        makeSiteGeocodingProviderError(input, {
          ...details,
          providerMessage: sanitizeProviderMessage(details.providerMessage),
        })
      )
    )
  );
}

type PortableFetch = (
  input: string,
  init?: Pick<RequestInit, "signal">
) => Promise<Response>;

const defaultPortableFetch: PortableFetch = (input, init) =>
  globalThis.fetch(input, init);

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
      readonly requestTimeout: Duration.Duration;
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
  return Match.type<GoogleGeocodingRequestFailure>().pipe(
    Match.tag("GoogleGeocodingFetchFailed", (value) => ({
      cause: value.cause,
      reason: "fetch_failed",
    })),
    Match.tag("GoogleGeocodingJsonDecodeFailed", (value) => ({
      cause: value.cause,
      reason: "json_decode_failed",
    })),
    Match.tag("GoogleGeocodingTimedOut", (value) => ({
      reason: "request_timeout",
      requestTimeout: value.requestTimeout,
    })),
    Match.exhaustive
  )(failure);
}

function fetchGoogleGeocodingPayload(options: {
  readonly country: CreateSiteInput["country"];
  readonly fetchImplementation: PortableFetch;
  readonly region: string;
  readonly requestTimeout: Duration.Duration;
  readonly url: URL;
}) {
  return Effect.acquireUseRelease(
    Effect.sync(() => new AbortController()),
    (controller) =>
      Effect.gen(function* fetchGoogleGeocodingPayloadEffect() {
        const response = yield* Effect.tryPromise({
          try: () =>
            options.fetchImplementation(options.url.toString(), {
              signal: controller.signal,
            }),
          catch: (cause) =>
            ({
              _tag: "GoogleGeocodingFetchFailed",
              cause,
            }) satisfies GoogleGeocodingRequestFailure,
        });
        yield* Effect.annotateCurrentSpan("http.status", response.status);

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
      })
        .pipe(
          Effect.timeoutFail({
            duration: options.requestTimeout,
            onTimeout: () =>
              ({
                _tag: "GoogleGeocodingTimedOut",
                requestTimeout: options.requestTimeout,
              }) satisfies GoogleGeocodingRequestFailure,
          })
        )
        .pipe(
          Effect.withSpan("SiteGeocoder.Google.fetch", {
            attributes: {
              provider: "google",
              requestTimeoutMs: Duration.toMillis(options.requestTimeout),
              siteCountry: options.country,
              siteRegion: options.region,
            },
            captureStackTrace: false,
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
  return EffectArray.filterMap(
    [
      input.addressLine1,
      input.addressLine2,
      input.town,
      input.county,
      input.eircode,
      countryName(input.country),
    ],
    (part) => {
      const normalized = normalizeAddressPart(part);

      return normalized === undefined || normalized.length === 0
        ? Option.none()
        : Option.some(normalized);
    }
  ).join(", ");
}

function nowIsoString() {
  return decodeIsoDateTimeString(new Date().toISOString());
}

export function makeDevelopmentSiteGeocoder(): SiteGeocoderImplementation {
  const geocode = Effect.fn("SiteGeocoder.Development.geocode")(
    (input: CreateSiteInput) =>
      Effect.sync(() => {
        const hash = stableHash(buildAddress(input).toLowerCase());
        const latitude = 49 + (hash % 1_000_000) / 100_000;
        const longitude =
          -11 + (Math.floor(hash / 1_000_000) % 1_300_000) / 100_000;

        return {
          geocodedAt: nowIsoString(),
          latitude: decodeSiteLatitude(latitude),
          longitude: decodeSiteLongitude(longitude),
          provider: "stub",
        } satisfies GeocodedSiteLocation;
      })
  );

  return { geocode };
}

export function makeGoogleSiteGeocoder(options: {
  readonly fetch?: PortableFetch;
  readonly googleMapsApiKey: string;
  readonly requestTimeout?: Duration.Duration;
}) {
  return Effect.gen(function* makeGoogleSiteGeocoderEffect() {
    const fetchImplementation = options.fetch ?? defaultPortableFetch;
    const { googleMapsApiKey, requestTimeout } =
      yield* decodeGoogleSiteGeocoderConfig(options);

    const geocode = Effect.fn("SiteGeocoder.Google.geocode")(function* geocode(
      input: CreateSiteInput
    ) {
      const region = googleRegionBias(input.country);
      const url = new URL(GOOGLE_GEOCODING_URL);
      url.searchParams.set("address", buildAddress(input));
      url.searchParams.set("region", region);
      url.searchParams.set("key", googleMapsApiKey);

      const requestResult = yield* fetchGoogleGeocodingPayload({
        country: input.country,
        fetchImplementation,
        region,
        requestTimeout,
        url,
      }).pipe(
        Effect.catchTags({
          GoogleGeocodingFetchFailed: (failure) =>
            logAndFailSiteGeocodingProvider(
              input,
              googleRequestFailureDetails(failure)
            ),
          GoogleGeocodingJsonDecodeFailed: (failure) =>
            logAndFailSiteGeocodingProvider(
              input,
              googleRequestFailureDetails(failure)
            ),
          GoogleGeocodingTimedOut: (failure) =>
            logAndFailSiteGeocodingProvider(
              input,
              googleRequestFailureDetails(failure)
            ),
        })
      );

      if (requestResult._tag === "HttpError") {
        return yield* logAndFailSiteGeocodingProvider(input, {
          httpStatus: requestResult.status,
          reason: "http_error",
        });
      }

      const decoded = yield* decodeGoogleGeocodeResponse(
        requestResult.payload
      ).pipe(
        Effect.catchTag("ParseError", (cause) =>
          logAndFailSiteGeocodingProvider(input, {
            cause,
            reason: "response_parse_failed",
          })
        )
      );
      yield* Effect.annotateCurrentSpan("providerStatus", decoded.status);
      yield* Effect.annotateCurrentSpan(
        "resultCount",
        decoded.results?.length ?? 0
      );

      if (decoded.status === "ZERO_RESULTS") {
        return yield* logAndFailSiteGeocoding(input, {
          providerStatus: decoded.status,
          reason: "zero_results",
        });
      }

      if (decoded.status !== "OK") {
        return yield* logAndFailSiteGeocodingProvider(input, {
          providerMessage: decoded.error_message,
          providerStatus: decoded.status,
          reason: "provider_status_not_ok",
        });
      }

      const firstResult = decoded.results?.[0];

      if (firstResult === undefined) {
        return yield* logAndFailSiteGeocodingProvider(input, {
          providerStatus: decoded.status,
          reason: "first_result_missing",
        });
      }

      const location = yield* decodeGoogleGeocodeResult(firstResult).pipe(
        Effect.map((result) => result.geometry.location),
        Effect.catchTag("ParseError", (cause) =>
          logAndFailSiteGeocodingProvider(input, {
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

const googleMapsApiKeyConfig = Config.redacted("GOOGLE_MAPS_API_KEY").pipe(
  Config.validate({
    message: "GOOGLE_MAPS_API_KEY must not be empty",
    validation: (value) => Redacted.value(value).trim().length > 0,
  })
);
const optionalLocalGoogleMapsApiKeyConfig = Config.option(
  Config.redacted("GOOGLE_MAPS_API_KEY")
).pipe(
  Config.map((value) => {
    if (Option.isNone(value)) {
      return Option.none();
    }

    return Redacted.value(value.value).trim().length > 0
      ? value
      : Option.none();
  })
);

export class SiteGeocoder extends Context.Tag(
  "@ceird/domains/sites/SiteGeocoder"
)<SiteGeocoder, SiteGeocoderImplementation>() {
  static readonly geocode = (input: CreateSiteInput) =>
    Effect.gen(function* SiteGeocoderGeocode() {
      const siteGeocoder = yield* SiteGeocoder;

      return yield* siteGeocoder.geocode(input);
    });

  static readonly Development = Layer.succeed(
    SiteGeocoder,
    makeDevelopmentSiteGeocoder()
  );

  static readonly Google = Layer.effect(
    SiteGeocoder,
    Effect.gen(function* SiteGeocoderGoogle() {
      const googleMapsApiKey = yield* googleMapsApiKeyConfig;

      return yield* makeGoogleSiteGeocoder({
        googleMapsApiKey: Redacted.value(googleMapsApiKey),
      });
    })
  );

  static readonly Local = Layer.effect(
    SiteGeocoder,
    Effect.gen(function* SiteGeocoderLocal() {
      const googleMapsApiKey = yield* optionalLocalGoogleMapsApiKeyConfig;

      if (Option.isNone(googleMapsApiKey)) {
        return makeDevelopmentSiteGeocoder();
      }

      return yield* makeGoogleSiteGeocoder({
        googleMapsApiKey: Redacted.value(googleMapsApiKey.value),
      });
    })
  );
}
