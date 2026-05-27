/* oxlint-disable eslint/max-classes-per-file */

import type { LabelNotFoundError } from "@ceird/labels-core";
import { Schema } from "effect";

import {
  GooglePlaceId,
  SiteCountrySchema,
  SiteLocationProviderSchema,
} from "./domain.js";
import { SiteId } from "./ids.js";

export const SITE_ACCESS_DENIED_ERROR_TAG =
  "@ceird/sites-core/SiteAccessDeniedError" as const;
export class SiteAccessDeniedError extends Schema.TaggedErrorClass<SiteAccessDeniedError>()(
  SITE_ACCESS_DENIED_ERROR_TAG,
  {
    message: Schema.String,
    siteId: Schema.optional(SiteId),
  },
  { httpApiStatus: 403 }
) {}

export const SITE_STORAGE_ERROR_TAG =
  "@ceird/sites-core/SiteStorageError" as const;
export class SiteStorageError extends Schema.TaggedErrorClass<SiteStorageError>()(
  SITE_STORAGE_ERROR_TAG,
  {
    message: Schema.String,
    cause: Schema.optional(Schema.String),
    siteId: Schema.optional(SiteId),
  },
  { httpApiStatus: 503 }
) {}

export const SITE_NOT_FOUND_ERROR_TAG =
  "@ceird/sites-core/SiteNotFoundError" as const;
export class SiteNotFoundError extends Schema.TaggedErrorClass<SiteNotFoundError>()(
  SITE_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    siteId: SiteId,
  },
  { httpApiStatus: 404 }
) {}

export const SITE_LIST_CURSOR_INVALID_ERROR_TAG =
  "@ceird/sites-core/SiteListCursorInvalidError" as const;
export class SiteListCursorInvalidError extends Schema.TaggedErrorClass<SiteListCursorInvalidError>()(
  SITE_LIST_CURSOR_INVALID_ERROR_TAG,
  {
    cursor: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 400 }
) {}

export const SITE_LOCATION_RESOLUTION_ERROR_TAG =
  "@ceird/sites-core/SiteLocationResolutionError" as const;
export const SITE_LOCATION_PROVIDER_OPERATIONS = [
  "autocomplete",
  "place_details",
] as const;
export const SiteLocationProviderOperationSchema = Schema.Literals(
  SITE_LOCATION_PROVIDER_OPERATIONS
);
export type SiteLocationProviderOperation = Schema.Schema.Type<
  typeof SiteLocationProviderOperationSchema
>;
export class SiteLocationResolutionError extends Schema.TaggedErrorClass<SiteLocationResolutionError>()(
  SITE_LOCATION_RESOLUTION_ERROR_TAG,
  {
    message: Schema.String,
    operation: Schema.optional(SiteLocationProviderOperationSchema),
    placeId: Schema.optional(GooglePlaceId),
    provider: Schema.optional(SiteLocationProviderSchema),
  },
  { httpApiStatus: 422 }
) {}

export const SITE_LOCATION_PROVIDER_ERROR_TAG =
  "@ceird/sites-core/SiteLocationProviderError" as const;
export const SITE_LOCATION_PROVIDER_ERROR_REASONS = [
  "fetch_failed",
  "http_error",
  "json_decode_failed",
  "request_timeout",
  "response_parse_failed",
] as const;
export const SiteLocationProviderErrorReasonSchema = Schema.Literals(
  SITE_LOCATION_PROVIDER_ERROR_REASONS
);
export type SiteLocationProviderErrorReason = Schema.Schema.Type<
  typeof SiteLocationProviderErrorReasonSchema
>;
export class SiteLocationProviderError extends Schema.TaggedErrorClass<SiteLocationProviderError>()(
  SITE_LOCATION_PROVIDER_ERROR_TAG,
  {
    message: Schema.String,
    country: Schema.optional(SiteCountrySchema),
    httpStatus: Schema.optional(Schema.Int),
    operation: SiteLocationProviderOperationSchema,
    placeId: Schema.optional(GooglePlaceId),
    provider: SiteLocationProviderSchema,
    providerMessage: Schema.optional(Schema.String),
    providerStatus: Schema.optional(Schema.String),
    reason: SiteLocationProviderErrorReasonSchema,
  },
  { httpApiStatus: 503 }
) {}

export type SitesError =
  | SiteAccessDeniedError
  | SiteStorageError
  | SiteNotFoundError
  | SiteListCursorInvalidError
  | SiteLocationResolutionError
  | SiteLocationProviderError
  | LabelNotFoundError;
