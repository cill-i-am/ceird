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

export const SITE_LOCATION_STATUSES = [
  "unverified",
  "google_resolved",
  "manually_adjusted",
  "validated",
  "needs_review",
] as const;
export const SiteLocationStatusSchema = Schema.Literals(SITE_LOCATION_STATUSES);
export type SiteLocationStatus = Schema.Schema.Type<
  typeof SiteLocationStatusSchema
>;

export const SITE_LOCATION_PROVIDERS = ["google_places", "stub"] as const;
export const SiteLocationProviderSchema = Schema.Literals(
  SITE_LOCATION_PROVIDERS
);
export type SiteLocationProvider = Schema.Schema.Type<
  typeof SiteLocationProviderSchema
>;

export const GOOGLE_PLACE_ID_MAX_LENGTH = 256;

const GOOGLE_PLACE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
export const GooglePlaceId = Schema.Trim.pipe(
  Schema.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(GOOGLE_PLACE_ID_MAX_LENGTH)
  ),
  Schema.refine(
    (value): value is string => GOOGLE_PLACE_ID_PATTERN.test(value),
    {
      message: "Google place ID must be a single URL path segment",
    }
  ),
  Schema.brand("@ceird/sites-core/GooglePlaceId")
);
export type GooglePlaceId = Schema.Schema.Type<typeof GooglePlaceId>;

export const GooglePlacesSessionToken = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(8), Schema.isMaxLength(128)),
  Schema.brand("@ceird/sites-core/GooglePlacesSessionToken")
);
export type GooglePlacesSessionToken = Schema.Schema.Type<
  typeof GooglePlacesSessionToken
>;

export const GoogleMapsApiKey = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.brand("@ceird/sites-core/GoogleMapsApiKey")
);
export type GoogleMapsApiKey = Schema.Schema.Type<typeof GoogleMapsApiKey>;
