import type {
  GooglePlacesSessionTokenType,
  SiteCountry,
  SiteLocationInput,
  SiteLocationStatusType,
} from "@ceird/sites-core";
import { GooglePlacesSessionToken } from "@ceird/sites-core";
import type { Context } from "effect";
import { Effect, Option, Schema } from "effect";

import type {
  ResolvedSiteLocation,
  SiteLocationProvider,
} from "./location-provider.js";

type SiteLocationProviderService = Context.Service.Shape<
  typeof SiteLocationProvider
>;

export type ManualLocationResolution = "google-first";

export interface ResolveCreateSiteLocationOptions {
  readonly manualLocationResolution?: ManualLocationResolution;
}

interface EmptyUnverifiedLocationRecord {
  readonly displayLocation: string;
  readonly locationStatus: Extract<SiteLocationStatusType, "unverified">;
}

interface ManualUnverifiedLocationRecord extends EmptyUnverifiedLocationRecord {
  readonly country?: Extract<SiteLocationInput, { kind: "manual" }>["country"];
  readonly eircode?: string;
  readonly rawLocationInput: string;
}

export type ResolvedSiteLocationRecord =
  | EmptyUnverifiedLocationRecord
  | ManualUnverifiedLocationRecord
  | ResolvedSiteLocation;

interface NormalizedManualLocationInput {
  readonly country?: SiteCountry;
  readonly eircode?: string;
  readonly rawInput: string;
  readonly searchInput: string;
}

const IRISH_EIRCODE_PATTERN =
  /^((?:[AC-FHKNPRTV-Y]\d{2})|D6W)\s?([0-9AC-FHKNPRTV-Y]{4})$/;
const decodeGooglePlacesSessionToken = Schema.decodeUnknownSync(
  GooglePlacesSessionToken
);

function emptyUnverifiedLocation(): EmptyUnverifiedLocationRecord {
  return {
    displayLocation: "",
    locationStatus: "unverified",
  };
}

function manualUnverifiedLocation(
  input: Extract<SiteLocationInput, { kind: "manual" }>
): ManualUnverifiedLocationRecord {
  const normalized = normalizeManualLocationInput(input);

  return {
    country: normalized.country,
    displayLocation: normalized.searchInput,
    eircode: normalized.eircode,
    locationStatus: "unverified",
    rawLocationInput: normalized.rawInput,
  };
}

function normalizeManualLocationInput(
  input: Extract<SiteLocationInput, { kind: "manual" }>
): NormalizedManualLocationInput {
  const { rawInput } = input;
  const canonicalEircode = canonicalizeIrishEircode(rawInput);
  const country =
    input.country === undefined && canonicalEircode !== undefined
      ? "IE"
      : input.country;

  return {
    country,
    eircode: canonicalEircode,
    rawInput,
    searchInput: canonicalEircode ?? rawInput,
  };
}

function canonicalizeIrishEircode(value: string): string | undefined {
  const compact = value.trim().toUpperCase().replaceAll(/\s+/g, "");
  const match = IRISH_EIRCODE_PATTERN.exec(compact);

  if (match === null) {
    return undefined;
  }

  return `${match[1]} ${match[2]}`;
}

function makeGooglePlacesSessionToken(): GooglePlacesSessionTokenType {
  return decodeGooglePlacesSessionToken(crypto.randomUUID());
}

const resolveManualGoogleFirst = Effect.fn("resolveManualGoogleFirst")(
  function* (
    input: Extract<SiteLocationInput, { kind: "manual" }>,
    provider: SiteLocationProviderService
  ) {
    const normalized = normalizeManualLocationInput(input);
    const sessionToken = makeGooglePlacesSessionToken();
    const fallback = manualUnverifiedLocation(input);

    const suggestion = yield* provider
      .autocomplete({
        country: normalized.country,
        input: normalized.searchInput,
        sessionToken,
      })
      .pipe(
        Effect.map((response) =>
          response.suggestions[0] === undefined
            ? Option.none()
            : Option.some(response.suggestions[0])
        ),
        Effect.catchTag("@ceird/sites-core/SiteLocationProviderError", () =>
          Effect.succeed(Option.none())
        )
      );

    if (Option.isNone(suggestion)) {
      return fallback;
    }

    return yield* provider
      .resolvePlace({
        placeId: suggestion.value.placeId,
        rawInput: normalized.rawInput,
        sessionToken,
      })
      .pipe(
        Effect.map(
          (location) =>
            ({
              ...location,
              country: normalized.country,
              eircode: normalized.eircode,
              rawLocationInput: normalized.rawInput,
            }) satisfies ResolvedSiteLocation
        ),
        Effect.catchTags({
          "@ceird/sites-core/SiteLocationProviderError": () =>
            Effect.succeed(fallback),
          "@ceird/sites-core/SiteLocationResolutionError": () =>
            Effect.succeed(fallback),
        })
      );
  }
);

export const resolveCreateSiteLocation = Effect.fn("resolveCreateSiteLocation")(
  function* (
    input: SiteLocationInput | undefined,
    provider: SiteLocationProviderService,
    options: ResolveCreateSiteLocationOptions = {}
  ) {
    if (input === undefined) {
      return emptyUnverifiedLocation();
    }

    if (input.kind === "manual") {
      return options.manualLocationResolution === "google-first"
        ? yield* resolveManualGoogleFirst(input, provider)
        : manualUnverifiedLocation(input);
    }

    return yield* provider.resolvePlace({
      placeId: input.placeId,
      rawInput: input.rawInput,
      sessionToken: input.sessionToken,
    });
  }
);

export const resolveUpdateSiteLocation = Effect.fn("resolveUpdateSiteLocation")(
  function* (
    input: SiteLocationInput | null,
    provider: SiteLocationProviderService
  ) {
    if (input === null) {
      return emptyUnverifiedLocation();
    }

    return yield* resolveCreateSiteLocation(input, provider);
  }
);
