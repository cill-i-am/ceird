/* oxlint-disable eslint/max-classes-per-file */

import { OrganizationId } from "@ceird/identity-core";
import { HttpApiSchema } from "@effect/platform";
import { Schema } from "effect";

import { SiteCountrySchema } from "./domain.js";
import { ServiceAreaId, SiteId } from "./ids.js";

export const SITE_ACCESS_DENIED_ERROR_TAG =
  "@ceird/sites-core/SiteAccessDeniedError" as const;
export class SiteAccessDeniedError extends Schema.TaggedError<SiteAccessDeniedError>()(
  SITE_ACCESS_DENIED_ERROR_TAG,
  {
    message: Schema.String,
    siteId: Schema.optional(SiteId),
  },
  HttpApiSchema.annotations({ status: 403 })
) {}

export const SITE_STORAGE_ERROR_TAG =
  "@ceird/sites-core/SiteStorageError" as const;
export class SiteStorageError extends Schema.TaggedError<SiteStorageError>()(
  SITE_STORAGE_ERROR_TAG,
  {
    message: Schema.String,
    cause: Schema.optional(Schema.String),
  },
  HttpApiSchema.annotations({ status: 503 })
) {}

export const SITE_NOT_FOUND_ERROR_TAG =
  "@ceird/sites-core/SiteNotFoundError" as const;
export class SiteNotFoundError extends Schema.TaggedError<SiteNotFoundError>()(
  SITE_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    siteId: SiteId,
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export const SITE_GEOCODING_FAILED_ERROR_TAG =
  "@ceird/sites-core/SiteGeocodingFailedError" as const;
export class SiteGeocodingFailedError extends Schema.TaggedError<SiteGeocodingFailedError>()(
  SITE_GEOCODING_FAILED_ERROR_TAG,
  {
    message: Schema.String,
    country: SiteCountrySchema,
    eircode: Schema.optional(Schema.String),
  },
  HttpApiSchema.annotations({ status: 422 })
) {}

export const SERVICE_AREA_NOT_FOUND_ERROR_TAG =
  "@ceird/sites-core/ServiceAreaNotFoundError" as const;
export class ServiceAreaNotFoundError extends Schema.TaggedError<ServiceAreaNotFoundError>()(
  SERVICE_AREA_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    organizationId: OrganizationId,
    serviceAreaId: ServiceAreaId,
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export type SitesError =
  | SiteAccessDeniedError
  | SiteStorageError
  | SiteNotFoundError
  | SiteGeocodingFailedError
  | ServiceAreaNotFoundError;
