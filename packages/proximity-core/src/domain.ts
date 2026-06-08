import { IsoDateTimeString as IdentityIsoDateTimeString } from "@ceird/identity-core";
import { Schema } from "effect";

export const IsoDateTimeString = IdentityIsoDateTimeString;
export type IsoDateTimeString = Schema.Schema.Type<typeof IsoDateTimeString>;

export const PROXIMITY_COUNTRIES = ["IE", "GB"] as const;
export const ProximityCountrySchema = Schema.Literals(PROXIMITY_COUNTRIES);
export type ProximityCountry = Schema.Schema.Type<
  typeof ProximityCountrySchema
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
  Schema.brand("@ceird/proximity-core/GooglePlaceId")
);
export type GooglePlaceId = Schema.Schema.Type<typeof GooglePlaceId>;

export const GooglePlacesSessionToken = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(8), Schema.isMaxLength(128)),
  Schema.brand("@ceird/proximity-core/GooglePlacesSessionToken")
);
export type GooglePlacesSessionToken = Schema.Schema.Type<
  typeof GooglePlacesSessionToken
>;

export const ProximityOriginToken = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(16), Schema.isMaxLength(4096)),
  Schema.refine((value): value is string => /^[A-Za-z0-9._-]+$/u.test(value), {
    message: "Proximity origin token must be base64url-compatible",
  }),
  Schema.brand("@ceird/proximity-core/ProximityOriginToken")
);
export type ProximityOriginToken = Schema.Schema.Type<
  typeof ProximityOriginToken
>;

export const ProximityLatitudeSchema = Schema.Number.pipe(
  Schema.check(
    Schema.isGreaterThanOrEqualTo(-90),
    Schema.isLessThanOrEqualTo(90)
  )
);
export type ProximityLatitude = Schema.Schema.Type<
  typeof ProximityLatitudeSchema
>;

export const ProximityLongitudeSchema = Schema.Number.pipe(
  Schema.check(
    Schema.isGreaterThanOrEqualTo(-180),
    Schema.isLessThanOrEqualTo(180)
  )
);
export type ProximityLongitude = Schema.Schema.Type<
  typeof ProximityLongitudeSchema
>;

export const ProximityCoordinatesSchema = Schema.Struct({
  latitude: ProximityLatitudeSchema,
  longitude: ProximityLongitudeSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ProximityCoordinates = Schema.Schema.Type<
  typeof ProximityCoordinatesSchema
>;

export const ProximityLimitSchema = Schema.Number.pipe(
  Schema.check(
    Schema.isInt(),
    Schema.isGreaterThan(0),
    Schema.isLessThanOrEqualTo(25)
  )
);
export type ProximityLimit = Schema.Schema.Type<typeof ProximityLimitSchema>;

export const PROXIMITY_PROVIDERS = ["google_routes", "test"] as const;
export const ProximityProviderSchema = Schema.Literals(PROXIMITY_PROVIDERS);
export type ProximityProvider = Schema.Schema.Type<
  typeof ProximityProviderSchema
>;

export const PROXIMITY_PROVIDER_REQUEST_KINDS = [
  "matrix",
  "route_line",
  "route_preview",
] as const;
export const ProximityProviderRequestKindSchema = Schema.Literals(
  PROXIMITY_PROVIDER_REQUEST_KINDS
);
export type ProximityProviderRequestKind = Schema.Schema.Type<
  typeof ProximityProviderRequestKindSchema
>;

export const PROXIMITY_COST_GUARD_SCOPES = [
  "actor",
  "agent_thread",
  "organization",
] as const;
export const ProximityCostGuardScopeSchema = Schema.Literals(
  PROXIMITY_COST_GUARD_SCOPES
);
export type ProximityCostGuardScope = Schema.Schema.Type<
  typeof ProximityCostGuardScopeSchema
>;
