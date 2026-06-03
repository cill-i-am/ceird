import {
  GoogleAddressComponentSchema,
  GoogleMapsApiKey as GoogleMapsApiKeySchema,
  GooglePlaceId,
  IsoDateTimeString as IsoDateTimeStringSchema,
  SiteLatitudeSchema,
  SiteLocationProviderError,
  SiteLocationResolutionError,
  SiteLongitudeSchema,
} from "@ceird/sites-core";
import type {
  GoogleAddressComponent,
  GooglePlaceIdType,
  IsoDateTimeStringType,
  SiteCountry,
  SiteLatitude,
  SiteLocationAutocompleteInput,
  SiteLocationAutocompleteResponse,
  SiteLocationPlaceDetailsInput,
  SiteLocationProviderErrorReason,
  SiteLocationProviderOperation,
  SiteLocationProviderType,
  SiteLongitude,
} from "@ceird/sites-core";
import {
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

const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";
const GOOGLE_PLACES_DETAILS_BASE_URL = "https://places.googleapis.com/v1";
const GOOGLE_PLACES_DETAILS_FIELD_MASK =
  "id,formattedAddress,addressComponents,location";
const GOOGLE_PLACES_AUTOCOMPLETE_FIELD_MASK =
  "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat";
const DEFAULT_GOOGLE_PLACES_REQUEST_TIMEOUT = Duration.seconds(5);
const SITE_LOCATION_PROVIDER_FAILED_MESSAGE = "Site location provider failed";

const GoogleStructuredTextSchema = Schema.Struct({
  text: Schema.String,
});

const GoogleAutocompleteSuggestionSchema = Schema.Struct({
  placePrediction: Schema.Struct({
    placeId: GooglePlaceId,
    structuredFormat: Schema.Struct({
      mainText: GoogleStructuredTextSchema,
      secondaryText: Schema.optional(GoogleStructuredTextSchema),
    }),
  }),
});

const GoogleAutocompleteResponseSchema = Schema.Struct({
  suggestions: Schema.optional(
    Schema.Array(GoogleAutocompleteSuggestionSchema)
  ),
});

const GooglePlaceLocationSchema = Schema.Struct({
  latitude: SiteLatitudeSchema,
  longitude: SiteLongitudeSchema,
});

const GooglePlaceDetailsResponseSchema = Schema.Struct({
  addressComponents: Schema.optional(
    Schema.Array(GoogleAddressComponentSchema)
  ),
  formattedAddress: Schema.optional(Schema.String),
  id: GooglePlaceId,
  location: Schema.optional(GooglePlaceLocationSchema),
});

const GoogleSiteLocationProviderConfigSchema = Schema.Struct({
  googleMapsApiKey: GoogleMapsApiKeySchema,
  requestTimeout: Schema.optional(
    Schema.Duration.pipe(
      Schema.refine(
        (value): value is Duration.Duration =>
          Duration.toMillis(value) >= 1 &&
          Duration.toMillis(value) <= Duration.toMillis(Duration.seconds(60)),
        {
          message:
            "requestTimeout must be between 1 millisecond and 60 seconds",
        }
      )
    )
  ),
});

const decodeGoogleAutocompleteResponse = Schema.decodeUnknownEffect(
  GoogleAutocompleteResponseSchema
);
const decodeGooglePlaceDetailsResponse = Schema.decodeUnknownEffect(
  GooglePlaceDetailsResponseSchema
);
const decodeGoogleSiteLocationProviderConfig = Schema.decodeUnknownEffect(
  GoogleSiteLocationProviderConfigSchema
);
const decodeGooglePlaceId = Schema.decodeUnknownSync(GooglePlaceId);
const decodeIsoDateTimeString = Schema.decodeUnknownSync(
  IsoDateTimeStringSchema
);
const decodeSiteLatitude = Schema.decodeUnknownSync(SiteLatitudeSchema);
const decodeSiteLongitude = Schema.decodeUnknownSync(SiteLongitudeSchema);

export interface ResolvedSiteLocation {
  readonly addressComponents: readonly GoogleAddressComponent[];
  readonly country?: SiteCountry;
  readonly displayLocation: string;
  readonly eircode?: string;
  readonly formattedAddress: string;
  readonly googlePlaceId: GooglePlaceIdType;
  readonly latitude: SiteLatitude;
  readonly locationProvider: SiteLocationProviderType;
  readonly locationResolvedAt: IsoDateTimeStringType;
  readonly locationStatus: "google_resolved";
  readonly longitude: SiteLongitude;
  readonly rawLocationInput: string;
}

export interface SiteLocationProviderImplementation {
  readonly autocomplete: (
    input: SiteLocationAutocompleteInput
  ) => Effect.Effect<
    SiteLocationAutocompleteResponse,
    SiteLocationProviderError
  >;
  readonly resolvePlace: (
    input: SiteLocationPlaceDetailsInput
  ) => Effect.Effect<
    ResolvedSiteLocation,
    SiteLocationProviderError | SiteLocationResolutionError
  >;
}

type PortableFetch = (input: string, init?: RequestInit) => Promise<Response>;

const defaultPortableFetch: PortableFetch = (input, init) =>
  globalThis.fetch(input, init);

type GooglePlacesRequestFailure =
  | {
      readonly _tag: "GooglePlacesFetchFailed";
      readonly cause: unknown;
    }
  | {
      readonly _tag: "GooglePlacesJsonDecodeFailed";
      readonly cause: unknown;
    }
  | {
      readonly _tag: "GooglePlacesTimedOut";
      readonly requestTimeout: Duration.Duration;
    };

type GooglePlacesRequestResult =
  | {
      readonly _tag: "Success";
      readonly payload: unknown;
    }
  | {
      readonly _tag: "HttpError";
      readonly providerMessage?: string;
      readonly providerStatus?: string;
      readonly status: number;
    };

function googleRequestFailureDetails(
  failure: GooglePlacesRequestFailure
): SiteLocationProviderRequestFailureDetails {
  return Match.type<GooglePlacesRequestFailure>().pipe(
    Match.tag(
      "GooglePlacesFetchFailed",
      (value) =>
        ({
          cause: value.cause,
          reason: "fetch_failed",
        }) satisfies SiteLocationProviderRequestFailureDetails
    ),
    Match.tag(
      "GooglePlacesJsonDecodeFailed",
      (value) =>
        ({
          cause: value.cause,
          reason: "json_decode_failed",
        }) satisfies SiteLocationProviderRequestFailureDetails
    ),
    Match.tag(
      "GooglePlacesTimedOut",
      (value) =>
        ({
          reason: "request_timeout",
          requestTimeout: value.requestTimeout,
        }) satisfies SiteLocationProviderRequestFailureDetails
    ),
    Match.exhaustive
  )(failure);
}

function fetchGooglePlacesPayload(options: {
  readonly body?: unknown;
  readonly fetchImplementation: PortableFetch;
  readonly fieldMask: string;
  readonly googleMapsApiKey: string;
  readonly method: "GET" | "POST";
  readonly requestTimeout: Duration.Duration;
  readonly url: string;
}): Effect.Effect<GooglePlacesRequestResult, GooglePlacesRequestFailure> {
  return Effect.acquireUseRelease(
    Effect.sync(() => new AbortController()),
    (controller) =>
      Effect.gen(function* fetchGooglePlacesPayloadEffect() {
        const response = yield* Effect.tryPromise({
          try: () =>
            options.fetchImplementation(options.url, {
              body:
                options.body === undefined
                  ? undefined
                  : JSON.stringify(options.body),
              headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": options.googleMapsApiKey,
                "X-Goog-FieldMask": options.fieldMask,
              },
              method: options.method,
              signal: controller.signal,
            }),
          catch: (cause) =>
            ({
              _tag: "GooglePlacesFetchFailed",
              cause,
            }) satisfies GooglePlacesRequestFailure,
        });
        yield* Effect.annotateCurrentSpan("http.status", response.status);

        if (!response.ok) {
          const providerErrorDetails =
            yield* readGoogleErrorResponseDetails(response);

          return {
            _tag: "HttpError",
            ...providerErrorDetails,
            status: response.status,
          } satisfies GooglePlacesRequestResult;
        }

        const payload = yield* Effect.tryPromise({
          try: () => response.json() as Promise<unknown>,
          catch: (cause) =>
            ({
              _tag: "GooglePlacesJsonDecodeFailed",
              cause,
            }) satisfies GooglePlacesRequestFailure,
        });

        return {
          _tag: "Success",
          payload,
        } satisfies GooglePlacesRequestResult;
      }).pipe(
        Effect.timeoutOrElse({
          duration: options.requestTimeout,
          orElse: () =>
            Effect.fail({
              _tag: "GooglePlacesTimedOut",
              requestTimeout: options.requestTimeout,
            } satisfies GooglePlacesRequestFailure),
        }),
        Effect.withSpan("SiteLocationProvider.Google.fetch", {
          attributes: {
            provider: "google_places",
            requestTimeoutMs: Duration.toMillis(options.requestTimeout),
          },
        })
      ),
    (controller) => Effect.sync(() => controller.abort())
  );
}

function readGoogleErrorResponseDetails(response: Response) {
  return Effect.tryPromise({
    try: () => response.json() as Promise<unknown>,
    catch: () => null,
  }).pipe(
    Effect.orElseSucceed(() => null),
    Effect.map(extractGoogleErrorResponseDetails)
  );
}

function extractGoogleErrorResponseDetails(payload: unknown): {
  readonly providerMessage?: string;
  readonly providerStatus?: string;
} {
  const error =
    isRecord(payload) && isRecord(payload.error) ? payload.error : undefined;

  if (error === undefined) {
    return {};
  }

  return {
    ...(typeof error.message === "string"
      ? { providerMessage: error.message }
      : {}),
    ...(typeof error.status === "string"
      ? { providerStatus: error.status }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

interface SiteLocationProviderFailureDetails {
  readonly cause?: unknown;
  readonly country?: SiteCountry;
  readonly httpStatus?: number;
  readonly operation: SiteLocationProviderOperation;
  readonly placeId?: GooglePlaceIdType;
  readonly provider: SiteLocationProviderType;
  readonly providerMessage?: string;
  readonly providerStatus?: string;
  readonly reason: SiteLocationProviderErrorReason;
  readonly requestTimeout?: Duration.Duration;
}

type SiteLocationProviderRequestFailureDetails = Omit<
  SiteLocationProviderFailureDetails,
  "country" | "operation" | "placeId" | "provider"
>;

function makeSiteLocationProviderError(
  details: SiteLocationProviderFailureDetails
) {
  return new SiteLocationProviderError({
    country: details.country,
    httpStatus: details.httpStatus,
    message: SITE_LOCATION_PROVIDER_FAILED_MESSAGE,
    operation: details.operation,
    placeId: details.placeId,
    provider: details.provider,
    providerMessage: sanitizeProviderMessage(details.providerMessage),
    providerStatus: details.providerStatus,
    reason: details.reason,
  });
}

function logAndFailSiteLocationProvider(
  details: SiteLocationProviderFailureDetails
): Effect.Effect<never, SiteLocationProviderError> {
  return Effect.logWarning("Site location provider failed").pipe(
    Effect.annotateLogs({
      ...(details.cause === undefined
        ? {}
        : { failureCauseType: failureCauseName(details.cause) }),
      ...(details.country === undefined
        ? {}
        : { siteCountry: details.country }),
      ...(details.httpStatus === undefined
        ? {}
        : { httpStatus: details.httpStatus }),
      operation: details.operation,
      ...(details.placeId === undefined ? {} : { placeId: details.placeId }),
      provider: details.provider,
      ...(details.providerMessage === undefined
        ? {}
        : {
            providerMessage: sanitizeProviderMessage(details.providerMessage),
          }),
      ...(details.providerStatus === undefined
        ? {}
        : { providerStatus: details.providerStatus }),
      reason: details.reason,
      ...(details.requestTimeout === undefined
        ? {}
        : { requestTimeoutMs: Duration.toMillis(details.requestTimeout) }),
    }),
    Effect.andThen(Effect.fail(makeSiteLocationProviderError(details)))
  );
}

function failSiteLocationResolution(input: SiteLocationPlaceDetailsInput) {
  return Effect.fail(
    new SiteLocationResolutionError({
      message: "Location could not be resolved from the selected place",
      operation: "place_details",
      placeId: input.placeId,
      provider: "google_places",
    })
  );
}

function nowIsoString() {
  return decodeIsoDateTimeString(new Date().toISOString());
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

function developmentCoordinates(value: string) {
  const hash = stableHash(value.toLowerCase());
  const latitude = 49 + (hash % 1_000_000) / 100_000;
  const longitude = -11 + (Math.floor(hash / 1_000_000) % 1_300_000) / 100_000;

  return {
    latitude: decodeSiteLatitude(latitude),
    longitude: decodeSiteLongitude(longitude),
  };
}

function makeDevelopmentPlaceId(input: string) {
  return decodeGooglePlaceId(`dev-${stableHash(input).toString(16)}`);
}

function makeGooglePlaceDetailsUrl(
  placeId: GooglePlaceIdType,
  sessionToken: SiteLocationPlaceDetailsInput["sessionToken"]
) {
  const url = new URL(
    `${GOOGLE_PLACES_DETAILS_BASE_URL}/places/${encodeURIComponent(placeId)}`
  );
  url.searchParams.set("sessionToken", sessionToken);

  return url.toString();
}

function googleProviderFailureContext(
  operation: SiteLocationProviderOperation,
  options: {
    readonly country?: SiteCountry;
    readonly placeId?: GooglePlaceIdType;
  } = {}
): Pick<
  SiteLocationProviderFailureDetails,
  "country" | "operation" | "placeId" | "provider"
> {
  return {
    operation,
    provider: "google_places",
    ...(options.country === undefined ? {} : { country: options.country }),
    ...(options.placeId === undefined ? {} : { placeId: options.placeId }),
  };
}

export function makeDevelopmentSiteLocationProvider(): SiteLocationProviderImplementation {
  return {
    autocomplete: (input) =>
      Effect.sync(() => ({
        suggestions: [
          {
            displayText: input.input,
            placeId: makeDevelopmentPlaceId(input.input),
          },
        ],
      })),
    resolvePlace: (input) =>
      Effect.sync(() => {
        const coordinates = developmentCoordinates(
          `${input.placeId}:${input.rawInput}`
        );

        return {
          addressComponents: [],
          displayLocation: input.rawInput,
          formattedAddress: input.rawInput,
          googlePlaceId: input.placeId,
          latitude: coordinates.latitude,
          locationProvider: "stub",
          locationResolvedAt: nowIsoString(),
          locationStatus: "google_resolved",
          longitude: coordinates.longitude,
          rawLocationInput: input.rawInput,
        } satisfies ResolvedSiteLocation;
      }),
  };
}

export function makeGoogleSiteLocationProvider(options: {
  readonly fetch?: PortableFetch;
  readonly googleMapsApiKey: string;
  readonly requestTimeout?: Duration.Duration;
}): Effect.Effect<SiteLocationProviderImplementation, Schema.SchemaError> {
  return Effect.gen(function* makeGoogleSiteLocationProviderEffect() {
    const fetchImplementation = options.fetch ?? defaultPortableFetch;
    const { googleMapsApiKey, requestTimeout } =
      yield* decodeGoogleSiteLocationProviderConfig(options);
    const effectiveRequestTimeout =
      requestTimeout ?? DEFAULT_GOOGLE_PLACES_REQUEST_TIMEOUT;

    const autocomplete: SiteLocationProviderImplementation["autocomplete"] = (
      input
    ) =>
      Effect.gen(function* autocompleteEffect() {
        const failureContext = googleProviderFailureContext("autocomplete", {
          country: input.country,
        });
        const requestResult = yield* fetchGooglePlacesPayload({
          body: {
            ...(input.country === undefined
              ? {}
              : { includedRegionCodes: [input.country.toLowerCase()] }),
            input: input.input,
            sessionToken: input.sessionToken,
          },
          fetchImplementation,
          fieldMask: GOOGLE_PLACES_AUTOCOMPLETE_FIELD_MASK,
          googleMapsApiKey,
          method: "POST",
          requestTimeout: effectiveRequestTimeout,
          url: GOOGLE_PLACES_AUTOCOMPLETE_URL,
        }).pipe(
          Effect.catchTags({
            GooglePlacesFetchFailed: (failure) =>
              logAndFailSiteLocationProvider({
                ...failureContext,
                ...googleRequestFailureDetails(failure),
              }),
            GooglePlacesJsonDecodeFailed: (failure) =>
              logAndFailSiteLocationProvider({
                ...failureContext,
                ...googleRequestFailureDetails(failure),
              }),
            GooglePlacesTimedOut: (failure) =>
              logAndFailSiteLocationProvider({
                ...failureContext,
                ...googleRequestFailureDetails(failure),
              }),
          })
        );

        if (requestResult._tag === "HttpError") {
          return yield* logAndFailSiteLocationProvider({
            ...failureContext,
            httpStatus: requestResult.status,
            providerMessage: requestResult.providerMessage,
            providerStatus: requestResult.providerStatus,
            reason: "http_error",
          });
        }

        const decoded = yield* decodeGoogleAutocompleteResponse(
          requestResult.payload
        ).pipe(
          Effect.catchTag("SchemaError", (cause) =>
            logAndFailSiteLocationProvider({
              ...failureContext,
              cause,
              reason: "response_parse_failed",
            })
          )
        );

        return {
          suggestions: (decoded.suggestions ?? []).map((suggestion) => ({
            displayText:
              suggestion.placePrediction.structuredFormat.mainText.text,
            placeId: suggestion.placePrediction.placeId,
            secondaryText:
              suggestion.placePrediction.structuredFormat.secondaryText?.text,
          })),
        } satisfies SiteLocationAutocompleteResponse;
      }).pipe(
        Effect.withSpan("SiteLocationProvider.Google.autocomplete", {
          attributes: {
            provider: "google_places",
            siteCountry: input.country,
          },
        })
      );

    const resolvePlace: SiteLocationProviderImplementation["resolvePlace"] = (
      input
    ) =>
      Effect.gen(function* resolvePlaceEffect() {
        const failureContext = googleProviderFailureContext("place_details", {
          placeId: input.placeId,
        });
        const requestResult = yield* fetchGooglePlacesPayload({
          fetchImplementation,
          fieldMask: GOOGLE_PLACES_DETAILS_FIELD_MASK,
          googleMapsApiKey,
          method: "GET",
          requestTimeout: effectiveRequestTimeout,
          url: makeGooglePlaceDetailsUrl(input.placeId, input.sessionToken),
        }).pipe(
          Effect.catchTags({
            GooglePlacesFetchFailed: (failure) =>
              logAndFailSiteLocationProvider({
                ...failureContext,
                ...googleRequestFailureDetails(failure),
              }),
            GooglePlacesJsonDecodeFailed: (failure) =>
              logAndFailSiteLocationProvider({
                ...failureContext,
                ...googleRequestFailureDetails(failure),
              }),
            GooglePlacesTimedOut: (failure) =>
              logAndFailSiteLocationProvider({
                ...failureContext,
                ...googleRequestFailureDetails(failure),
              }),
          })
        );

        if (requestResult._tag === "HttpError") {
          return yield* logAndFailSiteLocationProvider({
            ...failureContext,
            httpStatus: requestResult.status,
            providerMessage: requestResult.providerMessage,
            providerStatus: requestResult.providerStatus,
            reason: "http_error",
          });
        }

        const decoded = yield* decodeGooglePlaceDetailsResponse(
          requestResult.payload
        ).pipe(
          Effect.catchTag("SchemaError", (cause) =>
            logAndFailSiteLocationProvider({
              ...failureContext,
              cause,
              reason: "response_parse_failed",
            })
          )
        );

        if (
          decoded.formattedAddress === undefined ||
          decoded.location === undefined
        ) {
          return yield* failSiteLocationResolution(input);
        }

        return {
          addressComponents: decoded.addressComponents ?? [],
          displayLocation: decoded.formattedAddress,
          formattedAddress: decoded.formattedAddress,
          googlePlaceId: decoded.id,
          latitude: decoded.location.latitude,
          locationProvider: "google_places",
          locationResolvedAt: nowIsoString(),
          locationStatus: "google_resolved",
          longitude: decoded.location.longitude,
          rawLocationInput: input.rawInput,
        } satisfies ResolvedSiteLocation;
      }).pipe(
        Effect.withSpan("SiteLocationProvider.Google.resolvePlace", {
          attributes: {
            provider: "google_places",
          },
        })
      );

    return {
      autocomplete,
      resolvePlace,
    } satisfies SiteLocationProviderImplementation;
  });
}

function decodeGoogleMapsApiKey(value: Redacted.Redacted<string>) {
  return Schema.decodeUnknownEffect(GoogleMapsApiKeySchema)(
    Redacted.value(value)
  ).pipe(
    Effect.map((googleMapsApiKey) => Redacted.make(googleMapsApiKey)),
    Effect.catchTag("SchemaError", (error) =>
      Effect.fail(new Config.ConfigError(error))
    )
  );
}

const googleMapsApiKeyConfig = Config.redacted("GOOGLE_MAPS_API_KEY").pipe(
  Config.mapOrFail(decodeGoogleMapsApiKey)
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

export class SiteLocationProvider extends Context.Service<
  SiteLocationProvider,
  SiteLocationProviderImplementation
>()("@ceird/domains/sites/SiteLocationProvider") {
  static readonly autocomplete = (input: SiteLocationAutocompleteInput) =>
    SiteLocationProvider.use((service) => service.autocomplete(input));

  static readonly resolvePlace = (input: SiteLocationPlaceDetailsInput) =>
    SiteLocationProvider.use((service) => service.resolvePlace(input));

  static readonly Development = Layer.succeed(
    SiteLocationProvider,
    makeDevelopmentSiteLocationProvider()
  );

  static readonly Google = Layer.effect(
    SiteLocationProvider,
    Effect.gen(function* SiteLocationProviderGoogle() {
      const googleMapsApiKey = yield* googleMapsApiKeyConfig;

      return yield* makeGoogleSiteLocationProvider({
        googleMapsApiKey: Redacted.value(googleMapsApiKey),
      });
    })
  );

  static readonly Local = Layer.effect(
    SiteLocationProvider,
    Effect.gen(function* SiteLocationProviderLocal() {
      const googleMapsApiKey = yield* optionalLocalGoogleMapsApiKeyConfig;

      if (Option.isNone(googleMapsApiKey)) {
        return makeDevelopmentSiteLocationProvider();
      }

      return yield* makeGoogleSiteLocationProvider({
        googleMapsApiKey: Redacted.value(googleMapsApiKey.value),
      });
    })
  );
}
