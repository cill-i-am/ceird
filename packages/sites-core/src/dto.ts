import { Schema } from "effect";

import {
  IsoDateTimeString,
  SiteCountrySchema,
  SiteGeocodingProviderSchema,
  SiteLatitudeSchema,
  SiteLongitudeSchema,
} from "./domain.js";
import { ServiceAreaId, SiteId } from "./ids.js";

const NonEmptyTrimmedString = Schema.Trim.pipe(Schema.minLength(1));
const ConfigurationNameSchema = NonEmptyTrimmedString.pipe(
  Schema.maxLength(120)
);
const ConfigurationDescriptionSchema = NonEmptyTrimmedString.pipe(
  Schema.maxLength(500)
);

export const ServiceAreaSchema = Schema.Struct({
  id: ServiceAreaId,
  name: ConfigurationNameSchema,
  description: Schema.optional(ConfigurationDescriptionSchema),
});
export type ServiceArea = Schema.Schema.Type<typeof ServiceAreaSchema>;

export const ServiceAreaOptionSchema = Schema.Struct({
  id: ServiceAreaId,
  name: ConfigurationNameSchema,
});
export type ServiceAreaOption = Schema.Schema.Type<
  typeof ServiceAreaOptionSchema
>;

export const CreateServiceAreaInputSchema = Schema.Struct({
  name: ConfigurationNameSchema,
  description: Schema.optional(ConfigurationDescriptionSchema),
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type CreateServiceAreaInput = Schema.Schema.Type<
  typeof CreateServiceAreaInputSchema
>;

export const CreateServiceAreaResponseSchema = ServiceAreaSchema;
export type CreateServiceAreaResponse = Schema.Schema.Type<
  typeof CreateServiceAreaResponseSchema
>;

export const UpdateServiceAreaInputSchema = Schema.Struct({
  name: Schema.optional(ConfigurationNameSchema),
  description: Schema.optional(Schema.NullOr(ConfigurationDescriptionSchema)),
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type UpdateServiceAreaInput = Schema.Schema.Type<
  typeof UpdateServiceAreaInputSchema
>;

export const UpdateServiceAreaResponseSchema = ServiceAreaSchema;
export type UpdateServiceAreaResponse = Schema.Schema.Type<
  typeof UpdateServiceAreaResponseSchema
>;

export const ServiceAreaListResponseSchema = Schema.Struct({
  items: Schema.Array(ServiceAreaSchema),
});
export type ServiceAreaListResponse = Schema.Schema.Type<
  typeof ServiceAreaListResponseSchema
>;

export const CreateSiteInputSchema = Schema.Struct({
  name: NonEmptyTrimmedString,
  serviceAreaId: Schema.optional(ServiceAreaId),
  addressLine1: NonEmptyTrimmedString,
  addressLine2: Schema.optional(NonEmptyTrimmedString),
  town: Schema.optional(NonEmptyTrimmedString),
  county: NonEmptyTrimmedString,
  country: SiteCountrySchema,
  eircode: Schema.optional(NonEmptyTrimmedString),
  accessNotes: Schema.optional(NonEmptyTrimmedString),
})
  .annotations({
    parseOptions: { onExcessProperty: "error" },
  })
  .pipe(
    Schema.filter(
      ({ country, eircode }) => country !== "IE" || eircode !== undefined
    ),
    Schema.annotations({
      message: () => "Irish sites require an Eircode",
    })
  );
export type CreateSiteInput = Schema.Schema.Type<typeof CreateSiteInputSchema>;

export const SiteOptionSchema = Schema.Struct({
  id: SiteId,
  name: Schema.String,
  serviceAreaId: Schema.optional(ServiceAreaId),
  serviceAreaName: Schema.optional(Schema.String),
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
});
export type SiteOption = Schema.Schema.Type<typeof SiteOptionSchema>;

export const SiteDetailSchema = SiteOptionSchema;
export type SiteDetail = Schema.Schema.Type<typeof SiteDetailSchema>;

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

export const SitesOptionsResponseSchema = Schema.Struct({
  serviceAreas: Schema.Array(ServiceAreaOptionSchema),
  sites: Schema.Array(SiteOptionSchema),
});
export type SitesOptionsResponse = Schema.Schema.Type<
  typeof SitesOptionsResponseSchema
>;
