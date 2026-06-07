import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { AppApi } from "../../http-api.js";
import { observeApiOperation } from "../api-observability.js";
import { DomainCorsLive } from "../http-cors.js";
import { OrganizationSecurityActivityService } from "./security-activity.js";

const observeIdentityOperation = (operation: string) =>
  observeApiOperation({
    domain: "identity",
    operation,
    service: "OrganizationSecurityActivityService",
  });

const IdentityHandlersLive = HttpApiBuilder.group(
  AppApi,
  "identity",
  (handlers) =>
    Effect.gen(function* () {
      const securityActivityService =
        yield* OrganizationSecurityActivityService;

      return handlers.handle("listOrganizationSecurityActivity", ({ query }) =>
        securityActivityService
          .list(query)
          .pipe(observeIdentityOperation("listOrganizationSecurityActivity"))
      );
    })
);

export const IdentityHttpLive = Layer.mergeAll(
  DomainCorsLive,
  IdentityHandlersLive
).pipe(Layer.provide(OrganizationSecurityActivityService.Default));
