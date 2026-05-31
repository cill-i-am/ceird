import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { AppApi } from "../../http-api.js";
import { observeApiOperation } from "../api-observability.js";
import { SyncAuthorizationService } from "./service.js";

const observeSyncOperation = (operation: string) =>
  observeApiOperation({
    domain: "sync",
    operation,
    service: "SyncAuthorizationService",
  });

const SyncHandlersLive = HttpApiBuilder.group(
  AppApi,
  "syncInternal",
  (handlers) =>
    Effect.gen(function* () {
      const syncAuthorizationService = yield* SyncAuthorizationService;

      return handlers.handle("authorizeShape", ({ params }) =>
        syncAuthorizationService
          .authorizeShape(params.shapeName)
          .pipe(observeSyncOperation("authorizeShape"))
      );
    })
);

export const SyncHttpLive = SyncHandlersLive.pipe(
  Layer.provide(SyncAuthorizationService.Default)
);
