import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { AppApi } from "../../http-api.js";
import { observeApiOperation } from "../api-observability.js";
import { DomainCorsLive } from "../http-cors.js";
import { SitesService } from "./service.js";

const observeSitesOperation = (operation: string) =>
  observeApiOperation({
    domain: "sites",
    operation,
    service: "SitesService",
  });

const SitesHandlersLive = HttpApiBuilder.group(AppApi, "sites", (handlers) =>
  Effect.gen(function* () {
    const sitesService = yield* SitesService;

    return handlers
      .handle("getSiteOptions", () =>
        sitesService.getOptions().pipe(observeSitesOperation("getSiteOptions"))
      )
      .handle("listSites", ({ query }) =>
        sitesService.list(query).pipe(observeSitesOperation("listSites"))
      )
      .handle("autocompleteSiteLocation", ({ payload }) =>
        sitesService
          .autocompleteLocation(payload)
          .pipe(observeSitesOperation("autocompleteSiteLocation"))
      )
      .handle("getSiteLocationPlaceDetails", ({ payload }) =>
        sitesService
          .getLocationPlaceDetails(payload)
          .pipe(observeSitesOperation("getSiteLocationPlaceDetails"))
      )
      .handle("createSite", ({ payload }) =>
        sitesService.create(payload).pipe(observeSitesOperation("createSite"))
      )
      .handle("rankNearbySites", ({ payload }) =>
        sitesService
          .rankNearbySites(payload)
          .pipe(observeSitesOperation("rankNearbySites"))
      )
      .handle("getSiteRoutePreview", ({ params, payload }) =>
        sitesService
          .getSiteRoutePreview(params.siteId, payload)
          .pipe(observeSitesOperation("getSiteRoutePreview"))
      )
      .handle("updateSite", ({ params, payload }) =>
        sitesService
          .update(params.siteId, payload)
          .pipe(observeSitesOperation("updateSite"))
      )
      .handle("listSiteComments", ({ params }) =>
        sitesService
          .listComments(params.siteId)
          .pipe(observeSitesOperation("listSiteComments"))
      )
      .handle("addSiteComment", ({ params, payload }) =>
        sitesService
          .addComment(params.siteId, payload)
          .pipe(observeSitesOperation("addSiteComment"))
      )
      .handle("assignSiteLabel", ({ params, payload }) =>
        sitesService
          .assignLabel(params.siteId, payload)
          .pipe(observeSitesOperation("assignSiteLabel"))
      )
      .handle("removeSiteLabel", ({ params }) =>
        sitesService
          .removeLabel(params.siteId, params.labelId)
          .pipe(observeSitesOperation("removeSiteLabel"))
      );
  })
);

export const SitesHttpLive = Layer.mergeAll(
  DomainCorsLive,
  SitesHandlersLive
).pipe(Layer.provide(SitesService.Default));
