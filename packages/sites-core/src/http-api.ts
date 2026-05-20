import { LabelId, LabelNotFoundError } from "@ceird/labels-core";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";

import {
  AddSiteCommentInputSchema,
  AddSiteCommentResponseSchema,
  AssignSiteLabelInputSchema,
  CreateServiceAreaInputSchema,
  CreateServiceAreaResponseSchema,
  CreateSiteInputSchema,
  CreateSiteResponseSchema,
  ServiceAreaListResponseSchema,
  SiteCommentsResponseSchema,
  SiteDetailSchema,
  SiteListQuerySchema,
  SiteListResponseSchema,
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
  SiteGeocodingProviderError,
  SiteListCursorInvalidError,
  SiteNotFoundError,
  SiteStorageError,
} from "./errors.js";
import { ServiceAreaId, SiteId } from "./ids.js";

const sitesGroup = HttpApiGroup.make("sites")
  .add(
    HttpApiEndpoint.get("getSiteOptions", "/sites/options", {
      success: SitesOptionsResponseSchema,
      error: [SiteAccessDeniedError, SiteStorageError],
    })
  )
  .add(
    HttpApiEndpoint.get("listSites", "/sites", {
      query: SiteListQuerySchema,
      success: SiteListResponseSchema,
      error: [
        SiteListCursorInvalidError,
        SiteAccessDeniedError,
        SiteStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post("createSite", "/sites", {
      payload: CreateSiteInputSchema,
      success: CreateSiteResponseSchema.pipe(HttpApiSchema.status("Created")),
      error: [
        SiteAccessDeniedError,
        ServiceAreaNotFoundError,
        SiteGeocodingFailedError,
        SiteGeocodingProviderError,
        SiteStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.patch("updateSite", "/sites/:siteId", {
      params: { siteId: SiteId },
      payload: UpdateSiteInputSchema,
      success: UpdateSiteResponseSchema,
      error: [
        SiteAccessDeniedError,
        ServiceAreaNotFoundError,
        SiteNotFoundError,
        SiteGeocodingFailedError,
        SiteGeocodingProviderError,
        SiteStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.get("listSiteComments", "/sites/:siteId/comments", {
      params: { siteId: SiteId },
      success: SiteCommentsResponseSchema,
      error: [SiteAccessDeniedError, SiteNotFoundError, SiteStorageError],
    })
  )
  .add(
    HttpApiEndpoint.post("addSiteComment", "/sites/:siteId/comments", {
      params: { siteId: SiteId },
      payload: AddSiteCommentInputSchema,
      success: AddSiteCommentResponseSchema.pipe(
        HttpApiSchema.status("Created")
      ),
      error: [SiteAccessDeniedError, SiteNotFoundError, SiteStorageError],
    })
  )
  .add(
    HttpApiEndpoint.post("assignSiteLabel", "/sites/:siteId/labels", {
      params: { siteId: SiteId },
      payload: AssignSiteLabelInputSchema,
      success: SiteDetailSchema,
      error: [
        SiteAccessDeniedError,
        SiteNotFoundError,
        LabelNotFoundError,
        SiteStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.delete(
      "removeSiteLabel",
      "/sites/:siteId/labels/:labelId",
      {
        params: { siteId: SiteId, labelId: LabelId },
        success: SiteDetailSchema,
        error: [
          SiteAccessDeniedError,
          SiteNotFoundError,
          LabelNotFoundError,
          SiteStorageError,
        ],
      }
    )
  );

export const SitesApiGroup = sitesGroup;

const serviceAreasGroup = HttpApiGroup.make("serviceAreas")
  .add(
    HttpApiEndpoint.get("listServiceAreas", "/service-areas", {
      success: ServiceAreaListResponseSchema,
      error: [SiteAccessDeniedError, SiteStorageError],
    })
  )
  .add(
    HttpApiEndpoint.post("createServiceArea", "/service-areas", {
      payload: CreateServiceAreaInputSchema,
      success: CreateServiceAreaResponseSchema.pipe(
        HttpApiSchema.status("Created")
      ),
      error: [SiteAccessDeniedError, SiteStorageError],
    })
  )
  .add(
    HttpApiEndpoint.patch(
      "updateServiceArea",
      "/service-areas/:serviceAreaId",
      {
        params: { serviceAreaId: ServiceAreaId },
        payload: UpdateServiceAreaInputSchema,
        success: UpdateServiceAreaResponseSchema,
        error: [
          SiteAccessDeniedError,
          ServiceAreaNotFoundError,
          SiteStorageError,
        ],
      }
    )
  );

export const ServiceAreasApiGroup = serviceAreasGroup;

export const SitesApi = HttpApi.make("SitesApi")
  .add(SitesApiGroup)
  .add(ServiceAreasApiGroup);

export type ServiceAreasApiGroupType = typeof ServiceAreasApiGroup;
export type SitesApiGroupType = typeof SitesApiGroup;
export type SitesApiType = typeof SitesApi;
