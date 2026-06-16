import { LabelId, LabelNotFoundError } from "@ceird/labels-core";
import {
  ProximityAccessDeniedError,
  ProximityCostGuardError,
  ProximityProviderError,
  ProximityRouteUnavailableError,
} from "@ceird/proximity-core";
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
  CreateSiteInputSchema,
  SiteCommentsResponseSchema,
  SiteListQuerySchema,
  SiteListResponseSchema,
  SiteLocationAutocompleteInputSchema,
  SiteLocationAutocompleteResponseSchema,
  SiteLocationPlaceDetailsInputSchema,
  SiteLocationPlaceDetailsResponseSchema,
  SiteProximityInputSchema,
  SiteProximityResponseSchema,
  SiteRoutePreviewInputSchema,
  SiteRoutePreviewResponseSchema,
  SitesOptionsResponseSchema,
  SiteWriteResponseSchema,
  UpdateSiteInputSchema,
} from "./dto.js";
import {
  SiteAccessDeniedError,
  SiteListCursorInvalidError,
  SiteLocationProviderError,
  SiteLocationResolutionError,
  SiteNotFoundError,
  SiteStorageError,
} from "./errors.js";
import { SiteId } from "./ids.js";

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
    HttpApiEndpoint.post(
      "autocompleteSiteLocation",
      "/sites/location/autocomplete",
      {
        payload: SiteLocationAutocompleteInputSchema,
        success: SiteLocationAutocompleteResponseSchema,
        error: [
          SiteAccessDeniedError,
          SiteLocationProviderError,
          SiteStorageError,
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.post(
      "getSiteLocationPlaceDetails",
      "/sites/location/place-details",
      {
        payload: SiteLocationPlaceDetailsInputSchema,
        success: SiteLocationPlaceDetailsResponseSchema,
        error: [
          SiteAccessDeniedError,
          SiteLocationProviderError,
          SiteLocationResolutionError,
          SiteStorageError,
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.post("createSite", "/sites", {
      payload: CreateSiteInputSchema,
      success: SiteWriteResponseSchema.pipe(HttpApiSchema.status("Created")),
      error: [
        SiteAccessDeniedError,
        SiteLocationProviderError,
        SiteLocationResolutionError,
        SiteStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post("rankNearbySites", "/sites/proximity", {
      payload: SiteProximityInputSchema,
      success: SiteProximityResponseSchema,
      error: [
        SiteAccessDeniedError,
        ProximityAccessDeniedError,
        ProximityCostGuardError,
        ProximityProviderError,
        ProximityRouteUnavailableError,
        SiteStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post(
      "getSiteRoutePreview",
      "/sites/:siteId/route-preview",
      {
        params: { siteId: SiteId },
        payload: SiteRoutePreviewInputSchema,
        success: SiteRoutePreviewResponseSchema,
        error: [
          SiteAccessDeniedError,
          SiteNotFoundError,
          ProximityAccessDeniedError,
          ProximityCostGuardError,
          ProximityProviderError,
          ProximityRouteUnavailableError,
          SiteStorageError,
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.patch("updateSite", "/sites/:siteId", {
      params: { siteId: SiteId },
      payload: UpdateSiteInputSchema,
      success: SiteWriteResponseSchema,
      error: [
        SiteAccessDeniedError,
        SiteNotFoundError,
        SiteLocationProviderError,
        SiteLocationResolutionError,
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
      success: SiteWriteResponseSchema,
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
        success: SiteWriteResponseSchema,
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

export const SitesApi = HttpApi.make("SitesApi").add(SitesApiGroup);

export type SitesApiGroupType = typeof SitesApiGroup;
export type SitesApiType = typeof SitesApi;
