import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";

import { AppApi } from "../../http-api.js";
import { observeApiOperation } from "../api-observability.js";
import { DomainCorsLive } from "../http-cors.js";
import { SiteGeocoder } from "./geocoder.js";
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
      .handle("createSite", ({ payload }) =>
        sitesService.create(payload).pipe(observeSitesOperation("createSite"))
      )
      .handle("updateSite", ({ path, payload }) =>
        sitesService
          .update(path.siteId, payload)
          .pipe(observeSitesOperation("updateSite"))
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
        .handle("updateServiceArea", ({ path, payload }) =>
          serviceAreasService
            .update(path.serviceAreaId, payload)
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
    Layer.mergeAll(
      SitesService.Default,
      ServiceAreasService.Default,
      SiteGeocoder.Default
    )
  )
);
