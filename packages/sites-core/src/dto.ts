import { AddCommentInputSchema, CommentSchema } from "@ceird/comments-core";
import { LabelId, LabelSchema } from "@ceird/labels-core";
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

const SiteOptionBaseSchema = Schema.Struct({
  id: SiteId,
  name: Schema.String,
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
});
export const SiteOptionSchema = SiteOptionBaseSchema.pipe(
  Schema.refine(
    (site): site is Schema.Schema.Type<typeof SiteOptionBaseSchema> =>
      isSiteOptionLocationConsistent(site),
    {
      message: "Site location fields are inconsistent",
    }
  )
);
export type SiteOption = Schema.Schema.Type<typeof SiteOptionSchema>;

export const SiteDetailSchema = SiteOptionSchema;
export type SiteDetail = Schema.Schema.Type<typeof SiteDetailSchema>;

export const SiteCommentSchema = Schema.Struct({
  ...CommentSchema.fields,
  siteId: SiteId,
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

export const CreateSiteResponseSchema = SiteOptionSchema;
export type CreateSiteResponse = Schema.Schema.Type<
  typeof CreateSiteResponseSchema
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
  const hasLatitude = site.latitude !== undefined;
  const hasLongitude = site.longitude !== undefined;
  const hasCoordinatePair =
    site.latitude !== undefined && site.longitude !== undefined;
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
    site.googlePlaceId !== undefined &&
    site.locationProvider !== undefined &&
    site.locationResolvedAt !== undefined
  );
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
