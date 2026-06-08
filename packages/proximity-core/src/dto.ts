import { Schema } from "effect";

import {
  GooglePlaceId,
  GooglePlacesSessionToken,
  IsoDateTimeString,
  ProximityCoordinatesSchema,
  ProximityLimitSchema,
  ProximityCountrySchema,
  ProximityOriginToken,
  ProximityProviderRequestKindSchema,
  ProximityProviderSchema,
} from "./domain.js";
import type { ProximityCoordinates } from "./domain.js";

const NonEmptyTrimmedString = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1))
);
const ProximityOriginDisplayTextSchema = NonEmptyTrimmedString.pipe(
  Schema.check(Schema.isMaxLength(512))
);
const ProximityOriginRawInputSchema = NonEmptyTrimmedString.pipe(
  Schema.check(Schema.isMaxLength(512))
);
const ProximityOriginSearchInputSchema = NonEmptyTrimmedString.pipe(
  Schema.check(Schema.isMaxLength(256))
);

export const CurrentLocationOriginSchema = Schema.Struct({
  accuracyMeters: Schema.optional(
    Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0)))
  ),
  coordinates: ProximityCoordinatesSchema,
  mode: Schema.Literal("current_location"),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type CurrentLocationOrigin = Schema.Schema.Type<
  typeof CurrentLocationOriginSchema
>;

export const UnsignedTypedOriginSchema = Schema.Struct({
  coordinates: ProximityCoordinatesSchema,
  displayText: ProximityOriginDisplayTextSchema,
  mode: Schema.Literal("typed_origin"),
  placeId: GooglePlaceId,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type UnsignedTypedOrigin = Schema.Schema.Type<
  typeof UnsignedTypedOriginSchema
>;

export const TypedOriginSchema = Schema.Struct({
  ...UnsignedTypedOriginSchema.fields,
  originToken: ProximityOriginToken,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type TypedOrigin = Schema.Schema.Type<typeof TypedOriginSchema>;

export const ProximityOriginInputSchema = Schema.Union([
  CurrentLocationOriginSchema,
  TypedOriginSchema,
]);
export type ProximityOriginInput = Schema.Schema.Type<
  typeof ProximityOriginInputSchema
>;

export const ProximityOriginSummarySchema = Schema.Struct({
  accuracyMeters: Schema.optional(
    Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0)))
  ),
  computedAt: IsoDateTimeString,
  coordinates: ProximityCoordinatesSchema,
  displayText: ProximityOriginDisplayTextSchema,
  mode: Schema.Literals(["current_location", "typed_origin"] as const),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ProximityOriginSummary = Schema.Schema.Type<
  typeof ProximityOriginSummarySchema
>;

export const RouteSummarySchema = Schema.Struct({
  computedAt: IsoDateTimeString,
  distanceMeters: Schema.Number.pipe(
    Schema.check(Schema.isGreaterThanOrEqualTo(0))
  ),
  durationSeconds: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
  provider: ProximityProviderSchema,
  providerRequestKind: ProximityProviderRequestKindSchema,
  routeStatus: Schema.Literal("ok"),
  trafficAware: Schema.Boolean,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type RouteSummary = Schema.Schema.Type<typeof RouteSummarySchema>;

const EncodedPolylineRouteDisplayLineSchema = Schema.Struct({
  encodedPolyline: NonEmptyTrimmedString,
  format: Schema.Literal("encoded_polyline"),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const GeoJsonRouteDisplayLineSchema = Schema.Struct({
  coordinates: Schema.Array(ProximityCoordinatesSchema).pipe(
    Schema.refine(
      (coordinates): coordinates is readonly ProximityCoordinates[] =>
        coordinates.length >= 2,
      { message: "Route display line must include at least 2 coordinates" }
    )
  ),
  format: Schema.Literal("geojson_linestring"),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const RouteDisplayLineSchema = Schema.Union([
  EncodedPolylineRouteDisplayLineSchema,
  GeoJsonRouteDisplayLineSchema,
]);
export type RouteDisplayLine = Schema.Schema.Type<
  typeof RouteDisplayLineSchema
>;

export const RouteDisplayLineResponseSchema = Schema.Struct({
  line: Schema.optional(RouteDisplayLineSchema),
  routeSummary: RouteSummarySchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type RouteDisplayLineResponse = Schema.Schema.Type<
  typeof RouteDisplayLineResponseSchema
>;

export const PROXIMITY_EXCLUSION_REASONS = [
  "candidate_cap",
  "missing_coordinates",
  "no_driving_route",
  "no_site",
  "unmapped_site",
] as const;
export const ProximityExclusionReasonSchema = Schema.Literals(
  PROXIMITY_EXCLUSION_REASONS
);
export type ProximityExclusionReason = Schema.Schema.Type<
  typeof ProximityExclusionReasonSchema
>;

export const ProximityExcludedCountSchema = Schema.Struct({
  count: Schema.Number.pipe(
    Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
  ),
  reason: ProximityExclusionReasonSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ProximityExcludedCount = Schema.Schema.Type<
  typeof ProximityExcludedCountSchema
>;

export const ProximityResultMetadataSchema = Schema.Struct({
  candidateCount: Schema.Number.pipe(
    Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
  ),
  candidateLimitApplied: Schema.Boolean,
  excluded: Schema.Array(ProximityExcludedCountSchema),
  rankedCandidateLimit: Schema.Number.pipe(
    Schema.check(Schema.isInt(), Schema.isGreaterThan(0))
  ),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ProximityResultMetadata = Schema.Schema.Type<
  typeof ProximityResultMetadataSchema
>;

export const ProximityOriginAutocompleteInputSchema = Schema.Struct({
  country: Schema.optional(ProximityCountrySchema),
  input: ProximityOriginSearchInputSchema,
  sessionToken: GooglePlacesSessionToken,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ProximityOriginAutocompleteInput = Schema.Schema.Type<
  typeof ProximityOriginAutocompleteInputSchema
>;

export const ProximityOriginSuggestionSchema = Schema.Struct({
  displayText: ProximityOriginDisplayTextSchema,
  placeId: GooglePlaceId,
  secondaryText: Schema.optional(ProximityOriginDisplayTextSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ProximityOriginSuggestion = Schema.Schema.Type<
  typeof ProximityOriginSuggestionSchema
>;

export const ProximityOriginAutocompleteResponseSchema = Schema.Struct({
  suggestions: Schema.Array(ProximityOriginSuggestionSchema),
});
export type ProximityOriginAutocompleteResponse = Schema.Schema.Type<
  typeof ProximityOriginAutocompleteResponseSchema
>;

export const ProximityOriginPlaceDetailsInputSchema = Schema.Struct({
  placeId: GooglePlaceId,
  rawInput: ProximityOriginRawInputSchema,
  sessionToken: GooglePlacesSessionToken,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ProximityOriginPlaceDetailsInput = Schema.Schema.Type<
  typeof ProximityOriginPlaceDetailsInputSchema
>;

export const ProximityOriginPlaceDetailsResponseSchema = Schema.Struct({
  origin: TypedOriginSchema,
});
export type ProximityOriginPlaceDetailsResponse = Schema.Schema.Type<
  typeof ProximityOriginPlaceDetailsResponseSchema
>;

export { ProximityLimitSchema };
export type { ProximityLimit } from "./domain.js";
