import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
} from "effect/unstable/httpapi";

import {
  ProximityOriginAutocompleteInputSchema,
  ProximityOriginAutocompleteResponseSchema,
  ProximityOriginPlaceDetailsInputSchema,
  ProximityOriginPlaceDetailsResponseSchema,
} from "./dto.js";
import {
  ProximityAccessDeniedError,
  ProximityCostGuardError,
  ProximityOriginResolutionError,
  ProximityProviderError,
} from "./errors.js";

const proximityGroup = HttpApiGroup.make("proximity")
  .add(
    HttpApiEndpoint.post(
      "autocompleteOrigin",
      "/proximity/origins/autocomplete",
      {
        payload: ProximityOriginAutocompleteInputSchema,
        success: ProximityOriginAutocompleteResponseSchema,
        error: [
          ProximityAccessDeniedError,
          ProximityCostGuardError,
          ProximityOriginResolutionError,
          ProximityProviderError,
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.post(
      "getOriginPlaceDetails",
      "/proximity/origins/place-details",
      {
        payload: ProximityOriginPlaceDetailsInputSchema,
        success: ProximityOriginPlaceDetailsResponseSchema,
        error: [
          ProximityAccessDeniedError,
          ProximityCostGuardError,
          ProximityOriginResolutionError,
          ProximityProviderError,
        ],
      }
    )
  );

export const ProximityApiGroup = proximityGroup;

export const ProximityApi = HttpApi.make("ProximityApi").add(ProximityApiGroup);

export type ProximityApiGroupType = typeof ProximityApiGroup;
export type ProximityApiType = typeof ProximityApi;
