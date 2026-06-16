import {
  AddCommentInputSchema,
  CommentBodySchema,
  CommentId,
} from "@ceird/comments-core";
import { ProductActorId, ProductActorSchema } from "@ceird/identity-core";
import { LabelId, LabelSchema } from "@ceird/labels-core";
import {
  ProximityLimitSchema,
  ProximityOriginInputSchema,
  ProximityOriginSummarySchema,
  ProximityResultMetadataSchema,
  RouteDisplayLineSchema,
  RouteSummarySchema,
} from "@ceird/proximity-core";
import { Schema } from "effect";

import {
  GooglePlaceId,
  GooglePlacesSessionToken,
  IsoDateTimeString,
  SiteCountrySchema,
  SiteLatitudeSchema,
  SiteLocationProviderSchema,
  SiteLocationStatusSchema,
  SiteLongitudeSchema,
} from "./domain.js";
import { SiteId } from "./ids.js";

const NonEmptyTrimmedString = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1))
);
const SiteLocationSearchInput = NonEmptyTrimmedString.pipe(
  Schema.check(Schema.isMaxLength(256))
);
const SiteLocationRawInput = NonEmptyTrimmedString.pipe(
  Schema.check(Schema.isMaxLength(512))
);
const SiteLocationDisplayText = NonEmptyTrimmedString.pipe(
  Schema.check(Schema.isMaxLength(512))
);
const MAX_ELECTRIC_MUTATION_TXID = 4_294_967_295;

const GooglePlaceSiteLocationInputSchema = Schema.Struct({
  displayText: SiteLocationDisplayText,
  kind: Schema.Literal("google_place"),
  placeId: GooglePlaceId,
  rawInput: SiteLocationRawInput,
  secondaryText: Schema.optional(SiteLocationDisplayText),
  sessionToken: GooglePlacesSessionToken,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const ManualSiteLocationInputSchema = Schema.Struct({
  country: Schema.optional(SiteCountrySchema),
  kind: Schema.Literal("manual"),
  rawInput: SiteLocationRawInput,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const SiteLocationInputSchema = Schema.Union([
  GooglePlaceSiteLocationInputSchema,
  ManualSiteLocationInputSchema,
]);
export type SiteLocationInput = Schema.Schema.Type<
  typeof SiteLocationInputSchema
>;

export const CreateSiteInputSchema = Schema.Struct({
  accessNotes: Schema.optional(NonEmptyTrimmedString),
  location: Schema.optional(SiteLocationInputSchema),
  name: NonEmptyTrimmedString,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type CreateSiteInput = Schema.Schema.Type<typeof CreateSiteInputSchema>;

export const GoogleAddressComponentSchema = Schema.Struct({
  languageCode: Schema.optional(Schema.String),
  longText: Schema.String,
  shortText: Schema.String,
  types: Schema.Array(Schema.String),
});
export type GoogleAddressComponent = Schema.Schema.Type<
  typeof GoogleAddressComponentSchema
>;

export const SITE_ACTIVE_JOB_PRIORITIES = [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
] as const;
export const SiteActiveJobPrioritySchema = Schema.Literals(
  SITE_ACTIVE_JOB_PRIORITIES
);
export type SiteActiveJobPriority = Schema.Schema.Type<
  typeof SiteActiveJobPrioritySchema
>;

const SiteOptionBaseSchema = Schema.Struct({
  id: SiteId,
  name: Schema.String,
  updatedAt: IsoDateTimeString,
  displayLocation: Schema.String,
  hasUsableCoordinates: Schema.Boolean,
  locationStatus: SiteLocationStatusSchema,
  addressComponents: Schema.optional(
    Schema.Array(GoogleAddressComponentSchema)
  ),
  addressLine1: Schema.optional(Schema.String),
  addressLine2: Schema.optional(Schema.String),
  town: Schema.optional(Schema.String),
  county: Schema.optional(Schema.String),
  country: Schema.optional(SiteCountrySchema),
  eircode: Schema.optional(Schema.String),
  accessNotes: Schema.optional(Schema.String),
  formattedAddress: Schema.optional(Schema.String),
  googlePlaceId: Schema.optional(GooglePlaceId),
  latitude: Schema.optional(SiteLatitudeSchema),
  longitude: Schema.optional(SiteLongitudeSchema),
  locationProvider: Schema.optional(SiteLocationProviderSchema),
  locationResolvedAt: Schema.optional(IsoDateTimeString),
  rawLocationInput: Schema.optional(Schema.String),
  labels: Schema.Array(LabelSchema),
  activeJobCount: Schema.optional(
    Schema.Number.pipe(
      Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
    )
  ),
  highestActiveJobPriority: Schema.optional(SiteActiveJobPrioritySchema),
});
export const SiteOptionSchema = SiteOptionBaseSchema.pipe(
  Schema.refine(
    (site): site is Schema.Schema.Type<typeof SiteOptionBaseSchema> =>
      isSiteOptionLocationConsistent(site),
    {
      message: "Site location fields are inconsistent",
    }
  ),
  Schema.refine(
    (site): site is Schema.Schema.Type<typeof SiteOptionBaseSchema> =>
      isSiteOptionActiveWorkConsistent(site),
    {
      message: "Site active work fields are inconsistent",
    }
  )
);
export type SiteOption = Schema.Schema.Type<typeof SiteOptionSchema>;

export const SiteDetailSchema = SiteOptionSchema;
export type SiteDetail = Schema.Schema.Type<typeof SiteDetailSchema>;

export const SiteCommentSchema = Schema.Struct({
  actor: Schema.optional(ProductActorSchema),
  actorId: ProductActorId,
  authorName: Schema.optional(Schema.String),
  body: CommentBodySchema,
  createdAt: IsoDateTimeString,
  id: CommentId,
  siteId: SiteId,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type SiteComment = Schema.Schema.Type<typeof SiteCommentSchema>;

export const AddSiteCommentInputSchema = AddCommentInputSchema;
export type AddSiteCommentInput = Schema.Schema.Type<
  typeof AddSiteCommentInputSchema
>;

export const AddSiteCommentResponseSchema = SiteCommentSchema;
export type AddSiteCommentResponse = Schema.Schema.Type<
  typeof AddSiteCommentResponseSchema
>;

export const SiteCommentsResponseSchema = Schema.Struct({
  comments: Schema.Array(SiteCommentSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type SiteCommentsResponse = Schema.Schema.Type<
  typeof SiteCommentsResponseSchema
>;

export const SiteListCursor = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.brand("@ceird/sites-core/SiteListCursor")
);
export type SiteListCursor = Schema.Schema.Type<typeof SiteListCursor>;

export const SiteListQuerySchema = Schema.Struct({
  cursor: Schema.optional(SiteListCursor),
  limit: Schema.optional(
    Schema.NumberFromString.pipe(
      Schema.check(
        Schema.isInt(),
        Schema.isGreaterThan(0),
        Schema.isLessThanOrEqualTo(100)
      )
    )
  ),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type SiteListQuery = Schema.Schema.Type<typeof SiteListQuerySchema>;

export const SiteListResponseSchema = Schema.Struct({
  items: Schema.Array(SiteOptionSchema),
  nextCursor: Schema.optional(SiteListCursor),
});
export type SiteListResponse = Schema.Schema.Type<
  typeof SiteListResponseSchema
>;

export const SiteProximityFiltersSchema = Schema.Struct({
  query: Schema.optional(
    NonEmptyTrimmedString.pipe(Schema.check(Schema.isMaxLength(256)))
  ),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type SiteProximityFilters = Schema.Schema.Type<
  typeof SiteProximityFiltersSchema
>;

export const SiteProximityInputSchema = Schema.Struct({
  filters: Schema.optional(SiteProximityFiltersSchema),
  includeRouteLines: Schema.optional(Schema.Boolean),
  limit: Schema.optional(ProximityLimitSchema),
  origin: ProximityOriginInputSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type SiteProximityInput = Schema.Schema.Type<
  typeof SiteProximityInputSchema
>;

export const SiteProximityRowSchema = Schema.Struct({
  activeJobCount: Schema.Number.pipe(
    Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
  ),
  highestActiveJobPriority: Schema.optional(SiteActiveJobPrioritySchema),
  routeLine: Schema.optional(RouteDisplayLineSchema),
  routeSummary: RouteSummarySchema,
  site: SiteOptionSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type SiteProximityRow = Schema.Schema.Type<
  typeof SiteProximityRowSchema
>;

export const SiteProximityResponseSchema = Schema.Struct({
  meta: ProximityResultMetadataSchema,
  origin: ProximityOriginSummarySchema,
  rows: Schema.Array(SiteProximityRowSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type SiteProximityResponse = Schema.Schema.Type<
  typeof SiteProximityResponseSchema
>;

export const SiteRoutePreviewInputSchema = Schema.Struct({
  includeRouteLine: Schema.optional(Schema.Boolean),
  origin: ProximityOriginInputSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type SiteRoutePreviewInput = Schema.Schema.Type<
  typeof SiteRoutePreviewInputSchema
>;

export const SiteRoutePreviewResponseSchema = Schema.Struct({
  activeJobCount: Schema.Number.pipe(
    Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
  ),
  highestActiveJobPriority: Schema.optional(SiteActiveJobPrioritySchema),
  origin: ProximityOriginSummarySchema,
  routeLine: Schema.optional(RouteDisplayLineSchema),
  routeSummary: RouteSummarySchema,
  site: SiteOptionSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type SiteRoutePreviewResponse = Schema.Schema.Type<
  typeof SiteRoutePreviewResponseSchema
>;

export const CreateSiteResponseSchema = SiteOptionSchema;
export type CreateSiteResponse = Schema.Schema.Type<
  typeof CreateSiteResponseSchema
>;

export const ElectricMutationConfirmationSchema = Schema.Struct({
  txid: Schema.Number.pipe(
    Schema.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(0),
      Schema.isLessThanOrEqualTo(MAX_ELECTRIC_MUTATION_TXID)
    )
  ),
});
export type ElectricMutationConfirmation = Schema.Schema.Type<
  typeof ElectricMutationConfirmationSchema
>;

export const SiteWriteResponseSchema = Schema.Struct({
  mutation: ElectricMutationConfirmationSchema,
  site: SiteOptionSchema,
});
export type SiteWriteResponse = Schema.Schema.Type<
  typeof SiteWriteResponseSchema
>;

export const UpdateSiteInputSchema = Schema.Struct({
  accessNotes: Schema.optional(NonEmptyTrimmedString),
  location: Schema.optional(Schema.NullOr(SiteLocationInputSchema)),
  name: NonEmptyTrimmedString,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type UpdateSiteInput = Schema.Schema.Type<typeof UpdateSiteInputSchema>;

export const UpdateSiteResponseSchema = SiteOptionSchema;
export type UpdateSiteResponse = Schema.Schema.Type<
  typeof UpdateSiteResponseSchema
>;

export const AssignSiteLabelInputSchema = Schema.Struct({
  labelId: LabelId,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type AssignSiteLabelInput = Schema.Schema.Type<
  typeof AssignSiteLabelInputSchema
>;

export const SitesOptionsResponseSchema = Schema.Struct({
  sites: Schema.Array(SiteOptionSchema),
});
export type SitesOptionsResponse = Schema.Schema.Type<
  typeof SitesOptionsResponseSchema
>;

export const SiteLocationAutocompleteInputSchema = Schema.Struct({
  country: Schema.optional(SiteCountrySchema),
  input: SiteLocationSearchInput,
  sessionToken: GooglePlacesSessionToken,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type SiteLocationAutocompleteInput = Schema.Schema.Type<
  typeof SiteLocationAutocompleteInputSchema
>;

export const SiteLocationSuggestionSchema = Schema.Struct({
  displayText: Schema.String,
  placeId: GooglePlaceId,
  secondaryText: Schema.optional(Schema.String),
});
export type SiteLocationSuggestion = Schema.Schema.Type<
  typeof SiteLocationSuggestionSchema
>;

export const SiteLocationAutocompleteResponseSchema = Schema.Struct({
  suggestions: Schema.Array(SiteLocationSuggestionSchema),
});
export type SiteLocationAutocompleteResponse = Schema.Schema.Type<
  typeof SiteLocationAutocompleteResponseSchema
>;

export const SiteLocationPlaceDetailsInputSchema = Schema.Struct({
  placeId: GooglePlaceId,
  rawInput: SiteLocationRawInput,
  sessionToken: GooglePlacesSessionToken,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type SiteLocationPlaceDetailsInput = Schema.Schema.Type<
  typeof SiteLocationPlaceDetailsInputSchema
>;

export const SiteLocationPlaceDetailsResponseSchema = Schema.Struct({
  addressComponents: Schema.Array(GoogleAddressComponentSchema),
  displayLocation: Schema.String,
  formattedAddress: Schema.String,
  googlePlaceId: GooglePlaceId,
  latitude: SiteLatitudeSchema,
  longitude: SiteLongitudeSchema,
});
export type SiteLocationPlaceDetailsResponse = Schema.Schema.Type<
  typeof SiteLocationPlaceDetailsResponseSchema
>;

function isSiteOptionLocationConsistent(
  site: Schema.Schema.Type<typeof SiteOptionBaseSchema>
) {
  const hasLatitude = isPresent(site.latitude);
  const hasLongitude = isPresent(site.longitude);
  const hasCoordinatePair = hasLatitude && hasLongitude;
  const coordinateStatusIsUsable = isUsableCoordinateStatus(
    site.locationStatus
  );

  if (hasLatitude !== hasLongitude) {
    return false;
  }

  if (
    site.hasUsableCoordinates !==
    (hasCoordinatePair && coordinateStatusIsUsable)
  ) {
    return false;
  }

  if (hasCoordinatePair && !coordinateStatusIsUsable) {
    return false;
  }

  if (site.locationStatus !== "google_resolved") {
    return true;
  }

  return (
    hasCoordinatePair &&
    isPresent(site.googlePlaceId) &&
    isPresent(site.locationProvider) &&
    isPresent(site.locationResolvedAt)
  );
}

function isSiteOptionActiveWorkConsistent(
  site: Schema.Schema.Type<typeof SiteOptionBaseSchema>
) {
  if (site.activeJobCount === undefined) {
    return site.highestActiveJobPriority === undefined;
  }

  if (site.activeJobCount === 0) {
    return site.highestActiveJobPriority === undefined;
  }

  return true;
}

function isPresent<Value>(
  value: Value | null | undefined
): value is NonNullable<Value> {
  return value !== null && value !== undefined;
}

function isUsableCoordinateStatus(
  status: Schema.Schema.Type<typeof SiteLocationStatusSchema>
) {
  return (
    status === "google_resolved" ||
    status === "manually_adjusted" ||
    status === "validated"
  );
}
