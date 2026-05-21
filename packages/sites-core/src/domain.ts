import { IsoDateTimeString as IdentityIsoDateTimeString } from "@ceird/identity-core";
import { Schema } from "effect";

export const IsoDateTimeString = IdentityIsoDateTimeString;
export type IsoDateTimeString = Schema.Schema.Type<typeof IsoDateTimeString>;

export const SiteLatitudeSchema = Schema.Number.pipe(
  Schema.check(
    Schema.isGreaterThanOrEqualTo(-90),
    Schema.isLessThanOrEqualTo(90)
  )
);
export type SiteLatitude = Schema.Schema.Type<typeof SiteLatitudeSchema>;

export const SiteLongitudeSchema = Schema.Number.pipe(
  Schema.check(
    Schema.isGreaterThanOrEqualTo(-180),
    Schema.isLessThanOrEqualTo(180)
  )
);
export type SiteLongitude = Schema.Schema.Type<typeof SiteLongitudeSchema>;

export const SITE_COUNTRIES = ["IE", "GB"] as const;
export const SiteCountrySchema = Schema.Literals(SITE_COUNTRIES);
export type SiteCountry = Schema.Schema.Type<typeof SiteCountrySchema>;

export const SITE_GEOCODING_PROVIDERS = ["google", "stub"] as const;
export const SiteGeocodingProviderSchema = Schema.Literals(
  SITE_GEOCODING_PROVIDERS
);
export type SiteGeocodingProvider = Schema.Schema.Type<
  typeof SiteGeocodingProviderSchema
>;

export const GoogleMapsApiKey = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.brand("@ceird/sites-core/GoogleMapsApiKey")
);
export type GoogleMapsApiKey = Schema.Schema.Type<typeof GoogleMapsApiKey>;
