import { AddCommentInputSchema, CommentSchema } from "@ceird/comments-core";
import { LabelId, LabelSchema } from "@ceird/labels-core";
import { Schema } from "effect";

import {
  IsoDateTimeString,
  SiteCountrySchema,
  SiteGeocodingProviderSchema,
  SiteLatitudeSchema,
  SiteLongitudeSchema,
} from "./domain.js";
import { SiteId } from "./ids.js";

const NonEmptyTrimmedString = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1))
);

const CreateSiteInputBaseSchema = Schema.Struct({
  name: NonEmptyTrimmedString,
  addressLine1: NonEmptyTrimmedString,
  addressLine2: Schema.optional(NonEmptyTrimmedString),
  town: Schema.optional(NonEmptyTrimmedString),
  county: NonEmptyTrimmedString,
  country: SiteCountrySchema,
  eircode: Schema.optional(NonEmptyTrimmedString),
  accessNotes: Schema.optional(NonEmptyTrimmedString),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const CreateSiteInputSchema = CreateSiteInputBaseSchema.pipe(
  Schema.refine(
    (value): value is Schema.Schema.Type<typeof CreateSiteInputBaseSchema> =>
      value.country !== "IE" || value.eircode !== undefined,
    {
      message: "Irish sites require an Eircode",
    }
  )
).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type CreateSiteInput = Schema.Schema.Type<typeof CreateSiteInputSchema>;

export const SiteOptionSchema = Schema.Struct({
  id: SiteId,
  name: Schema.String,
  addressLine1: Schema.String,
  addressLine2: Schema.optional(Schema.String),
  town: Schema.optional(Schema.String),
  county: Schema.String,
  country: SiteCountrySchema,
  eircode: Schema.optional(Schema.String),
  accessNotes: Schema.optional(Schema.String),
  latitude: SiteLatitudeSchema,
  longitude: SiteLongitudeSchema,
  geocodingProvider: SiteGeocodingProviderSchema,
  geocodedAt: IsoDateTimeString,
  labels: Schema.Array(LabelSchema),
});
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

export const UpdateSiteInputSchema = CreateSiteInputSchema;
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
