import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { AppApi } from "../../http-api.js";
import { observeApiOperation } from "../api-observability.js";
import { DomainCorsLive } from "../http-cors.js";
import { ServiceAreasService } from "./service-areas-service.js";
import { SitesService } from "./service.js";

const observeSitesOperation = (operation: string) =>
  observeApiOperation({
    domain: "sites",
    operation,
    service: "SitesService",
  });

const observeServiceAreasOperation = (operation: string) =>
  observeApiOperation({
    domain: "serviceAreas",
    operation,
    service: "ServiceAreasService",
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
      .handle("createSite", ({ payload }) =>
        sitesService.create(payload).pipe(observeSitesOperation("createSite"))
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

const ServiceAreasHandlersLive = HttpApiBuilder.group(
  AppApi,
  "serviceAreas",
  (handlers) =>
    Effect.gen(function* () {
      const serviceAreasService = yield* ServiceAreasService;

      return handlers
        .handle("listServiceAreas", () =>
          serviceAreasService
            .list()
            .pipe(observeServiceAreasOperation("listServiceAreas"))
        )
        .handle("createServiceArea", ({ payload }) =>
          serviceAreasService
            .create(payload)
            .pipe(observeServiceAreasOperation("createServiceArea"))
        )
        .handle("updateServiceArea", ({ params, payload }) =>
          serviceAreasService
            .update(params.serviceAreaId, payload)
            .pipe(observeServiceAreasOperation("updateServiceArea"))
        );
    })
);

export const SitesHttpLive = Layer.mergeAll(
  DomainCorsLive,
  SitesHandlersLive,
  ServiceAreasHandlersLive
).pipe(
  Layer.provide(
    Layer.mergeAll(SitesService.Default, ServiceAreasService.Default)
  )
);
