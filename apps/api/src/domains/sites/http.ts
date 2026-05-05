import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";

import { AppApi } from "../../http-api.js";
import { DomainCorsLive } from "../http-cors.js";
import { SiteGeocoder } from "./geocoder.js";
import { ServiceAreasService } from "./service-areas-service.js";
import { SitesService } from "./service.js";

const SitesHandlersLive = HttpApiBuilder.group(AppApi, "sites", (handlers) =>
  Effect.gen(function* () {
    const sitesService = yield* SitesService;

    return handlers
      .handle("getSiteOptions", () => sitesService.getOptions())
      .handle("createSite", ({ payload }) => sitesService.create(payload))
      .handle("updateSite", ({ path, payload }) =>
        sitesService.update(path.siteId, payload)
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
        .handle("listServiceAreas", () => serviceAreasService.list())
        .handle("createServiceArea", ({ payload }) =>
          serviceAreasService.create(payload)
        )
        .handle("updateServiceArea", ({ path, payload }) =>
          serviceAreasService.update(path.serviceAreaId, payload)
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
