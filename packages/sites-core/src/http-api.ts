import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";

import {
  CreateServiceAreaInputSchema,
  CreateServiceAreaResponseSchema,
  CreateSiteInputSchema,
  CreateSiteResponseSchema,
  ServiceAreaListResponseSchema,
  SitesOptionsResponseSchema,
  UpdateServiceAreaInputSchema,
  UpdateServiceAreaResponseSchema,
  UpdateSiteInputSchema,
  UpdateSiteResponseSchema,
} from "./dto.js";
import {
  ServiceAreaNotFoundError,
  SiteAccessDeniedError,
  SiteGeocodingFailedError,
  SiteNotFoundError,
  SiteStorageError,
} from "./errors.js";
import { ServiceAreaId, SiteId } from "./ids.js";

const sitesGroup = HttpApiGroup.make("sites")
  .add(
    HttpApiEndpoint.get("getSiteOptions", "/sites/options")
      .addSuccess(SitesOptionsResponseSchema)
      .addError(SiteAccessDeniedError)
      .addError(SiteStorageError)
  )
  .add(
    HttpApiEndpoint.post("createSite", "/sites")
      .setPayload(CreateSiteInputSchema)
      .addSuccess(CreateSiteResponseSchema, { status: 201 })
      .addError(SiteAccessDeniedError)
      .addError(ServiceAreaNotFoundError)
      .addError(SiteGeocodingFailedError)
      .addError(SiteStorageError)
  )
  .add(
    HttpApiEndpoint.patch("updateSite", "/sites/:siteId")
      .setPath(Schema.Struct({ siteId: SiteId }))
      .setPayload(UpdateSiteInputSchema)
      .addSuccess(UpdateSiteResponseSchema)
      .addError(SiteAccessDeniedError)
      .addError(ServiceAreaNotFoundError)
      .addError(SiteNotFoundError)
      .addError(SiteGeocodingFailedError)
      .addError(SiteStorageError)
  );

export const SitesApiGroup = sitesGroup;

const serviceAreasGroup = HttpApiGroup.make("serviceAreas")
  .add(
    HttpApiEndpoint.get("listServiceAreas", "/service-areas")
      .addSuccess(ServiceAreaListResponseSchema)
      .addError(SiteAccessDeniedError)
      .addError(SiteStorageError)
  )
  .add(
    HttpApiEndpoint.post("createServiceArea", "/service-areas")
      .setPayload(CreateServiceAreaInputSchema)
      .addSuccess(CreateServiceAreaResponseSchema, { status: 201 })
      .addError(SiteAccessDeniedError)
      .addError(SiteStorageError)
  )
  .add(
    HttpApiEndpoint.patch("updateServiceArea", "/service-areas/:serviceAreaId")
      .setPath(Schema.Struct({ serviceAreaId: ServiceAreaId }))
      .setPayload(UpdateServiceAreaInputSchema)
      .addSuccess(UpdateServiceAreaResponseSchema)
      .addError(SiteAccessDeniedError)
      .addError(ServiceAreaNotFoundError)
      .addError(SiteStorageError)
  );

export const ServiceAreasApiGroup = serviceAreasGroup;

export const SitesApi = HttpApi.make("SitesApi")
  .add(SitesApiGroup)
  .add(ServiceAreasApiGroup);

export type ServiceAreasApiGroupType = typeof ServiceAreasApiGroup;
export type SitesApiGroupType = typeof SitesApiGroup;
export type SitesApiType = typeof SitesApi;
