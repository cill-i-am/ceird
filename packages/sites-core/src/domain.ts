import { IsoDateTimeString as IdentityIsoDateTimeString } from "@ceird/identity-core";
import { Schema } from "effect";

export const IsoDateTimeString = IdentityIsoDateTimeString;
export type IsoDateTimeString = Schema.Schema.Type<typeof IsoDateTimeString>;

export const SiteLatitudeSchema = Schema.Number.pipe(
  Schema.greaterThanOrEqualTo(-90),
  Schema.lessThanOrEqualTo(90)
);
export type SiteLatitude = Schema.Schema.Type<typeof SiteLatitudeSchema>;

export const SiteLongitudeSchema = Schema.Number.pipe(
  Schema.greaterThanOrEqualTo(-180),
  Schema.lessThanOrEqualTo(180)
);
export type SiteLongitude = Schema.Schema.Type<typeof SiteLongitudeSchema>;

export const SITE_COUNTRIES = ["IE", "GB"] as const;
export const SiteCountrySchema = Schema.Literal(...SITE_COUNTRIES);
export type SiteCountry = Schema.Schema.Type<typeof SiteCountrySchema>;

export const SITE_GEOCODING_PROVIDERS = ["google", "stub"] as const;
export const SiteGeocodingProviderSchema = Schema.Literal(
  ...SITE_GEOCODING_PROVIDERS
);
export type SiteGeocodingProvider = Schema.Schema.Type<
  typeof SiteGeocodingProviderSchema
>;
