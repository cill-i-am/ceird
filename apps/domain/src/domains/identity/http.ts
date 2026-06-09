import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { AppApi } from "../../http-api.js";
import { observeApiOperation } from "../api-observability.js";
import { DomainCorsLive } from "../http-cors.js";
import { ConnectedAppGrantsService } from "./connected-apps.js";
import { OrganizationSecurityActivityService } from "./security-activity.js";

const observeIdentityOperation = (operation: string, service: string) =>
  observeApiOperation({
    domain: "identity",
    operation,
    service,
  });

const IdentityHandlersLive = HttpApiBuilder.group(
  AppApi,
  "identity",
  (handlers) =>
    Effect.gen(function* () {
      const connectedAppGrantsService = yield* ConnectedAppGrantsService;
      const securityActivityService =
        yield* OrganizationSecurityActivityService;

      return handlers
        .handle("listOrganizationSecurityActivity", ({ query }) =>
          securityActivityService
            .list(query)
            .pipe(
              observeIdentityOperation(
                "listOrganizationSecurityActivity",
                "OrganizationSecurityActivityService"
              )
            )
        )
        .handle("listConnectedAppGrants", () =>
          connectedAppGrantsService
            .list()
            .pipe(
              observeIdentityOperation(
                "listConnectedAppGrants",
                "ConnectedAppGrantsService"
              )
            )
        )
        .handle("disconnectConnectedAppGrant", ({ params }) =>
          connectedAppGrantsService
            .disconnect({ grantId: params.grantId })
            .pipe(
              observeIdentityOperation(
                "disconnectConnectedAppGrant",
                "ConnectedAppGrantsService"
              )
            )
        );
    })
);

export const IdentityHttpLive = Layer.mergeAll(
  DomainCorsLive,
  IdentityHandlersLive
).pipe(
  Layer.provide(
    Layer.mergeAll(
      ConnectedAppGrantsService.Default,
      OrganizationSecurityActivityService.Default
    )
  )
);
