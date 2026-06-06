/* oxlint-disable eslint/max-classes-per-file */

import { Schema } from "effect";

import { ProximityCostGuardScopeSchema } from "./domain.js";

export const PROXIMITY_ACCESS_DENIED_ERROR_TAG =
  "@ceird/proximity-core/ProximityAccessDeniedError" as const;
export class ProximityAccessDeniedError extends Schema.TaggedErrorClass<ProximityAccessDeniedError>()(
  PROXIMITY_ACCESS_DENIED_ERROR_TAG,
  {
    message: Schema.String,
  },
  { httpApiStatus: 403 }
) {}

export const PROXIMITY_PROVIDER_ERROR_TAG =
  "@ceird/proximity-core/ProximityProviderError" as const;
export class ProximityProviderError extends Schema.TaggedErrorClass<ProximityProviderError>()(
  PROXIMITY_PROVIDER_ERROR_TAG,
  {
    message: Schema.String,
    provider: Schema.Literals([
      "google_routes",
      "google_places",
      "test",
    ] as const),
    reason: Schema.String,
    retryAfterSeconds: Schema.optional(
      Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0)))
    ),
  },
  { httpApiStatus: 502 }
) {}

export const PROXIMITY_ORIGIN_RESOLUTION_ERROR_TAG =
  "@ceird/proximity-core/ProximityOriginResolutionError" as const;
export class ProximityOriginResolutionError extends Schema.TaggedErrorClass<ProximityOriginResolutionError>()(
  PROXIMITY_ORIGIN_RESOLUTION_ERROR_TAG,
  {
    message: Schema.String,
    operation: Schema.Literals(["autocomplete", "place_details"] as const),
    reason: Schema.String,
  },
  { httpApiStatus: 422 }
) {}

export const PROXIMITY_ROUTE_UNAVAILABLE_ERROR_TAG =
  "@ceird/proximity-core/ProximityRouteUnavailableError" as const;
export class ProximityRouteUnavailableError extends Schema.TaggedErrorClass<ProximityRouteUnavailableError>()(
  PROXIMITY_ROUTE_UNAVAILABLE_ERROR_TAG,
  {
    message: Schema.String,
    reason: Schema.Literals([
      "destination_unmapped",
      "missing_origin",
      "no_driving_route",
      "provider_unavailable",
    ] as const),
  },
  { httpApiStatus: 422 }
) {}

export const PROXIMITY_COST_GUARD_ERROR_TAG =
  "@ceird/proximity-core/ProximityCostGuardError" as const;
export class ProximityCostGuardError extends Schema.TaggedErrorClass<ProximityCostGuardError>()(
  PROXIMITY_COST_GUARD_ERROR_TAG,
  {
    limit: Schema.Number.pipe(
      Schema.check(Schema.isInt(), Schema.isGreaterThan(0))
    ),
    message: Schema.String,
    retryAfterSeconds: Schema.optional(
      Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0)))
    ),
    scope: ProximityCostGuardScopeSchema,
  },
  { httpApiStatus: 429 }
) {}

export type ProximityError =
  | ProximityAccessDeniedError
  | ProximityCostGuardError
  | ProximityOriginResolutionError
  | ProximityProviderError
  | ProximityRouteUnavailableError;
