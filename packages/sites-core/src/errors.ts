/* oxlint-disable eslint/max-classes-per-file */

import { OrganizationId } from "@ceird/identity-core";
import type { LabelNotFoundError } from "@ceird/labels-core";
import { Schema } from "effect";

import { SiteCountrySchema } from "./domain.js";
import { ServiceAreaId, SiteId } from "./ids.js";

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

export const SITE_GEOCODING_FAILED_ERROR_TAG =
  "@ceird/sites-core/SiteGeocodingFailedError" as const;
export class SiteGeocodingFailedError extends Schema.TaggedErrorClass<SiteGeocodingFailedError>()(
  SITE_GEOCODING_FAILED_ERROR_TAG,
  {
    message: Schema.String,
    country: SiteCountrySchema,
    eircode: Schema.optional(Schema.String),
  },
  { httpApiStatus: 422 }
) {}

export const SITE_GEOCODING_PROVIDER_ERROR_TAG =
  "@ceird/sites-core/SiteGeocodingProviderError" as const;
export class SiteGeocodingProviderError extends Schema.TaggedErrorClass<SiteGeocodingProviderError>()(
  SITE_GEOCODING_PROVIDER_ERROR_TAG,
  {
    message: Schema.String,
    country: SiteCountrySchema,
    eircode: Schema.optional(Schema.String),
    httpStatus: Schema.optional(Schema.Int),
    providerMessage: Schema.optional(Schema.String),
    providerStatus: Schema.optional(Schema.String),
    reason: Schema.String,
  },
  { httpApiStatus: 503 }
) {}

export const SERVICE_AREA_NOT_FOUND_ERROR_TAG =
  "@ceird/sites-core/ServiceAreaNotFoundError" as const;
export class ServiceAreaNotFoundError extends Schema.TaggedErrorClass<ServiceAreaNotFoundError>()(
  SERVICE_AREA_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    organizationId: OrganizationId,
    serviceAreaId: ServiceAreaId,
  },
  { httpApiStatus: 404 }
) {}

export type SitesError =
  | SiteAccessDeniedError
  | SiteStorageError
  | SiteNotFoundError
  | SiteListCursorInvalidError
  | SiteGeocodingFailedError
  | SiteGeocodingProviderError
  | LabelNotFoundError
  | ServiceAreaNotFoundError;
