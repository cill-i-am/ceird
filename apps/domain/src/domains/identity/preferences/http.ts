import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { AppApi } from "../../../http-api.js";
import { observeApiOperation } from "../../api-observability.js";
import { DomainCorsLive } from "../../http-cors.js";
import { UserPreferencesService } from "./service.js";

const observeUserPreferencesOperation = (operation: string) =>
  observeApiOperation({
    domain: "identity",
    operation,
    service: "UserPreferencesService",
  });

const UserPreferencesHandlersLive = HttpApiBuilder.group(
  AppApi,
  "userPreferences",
  (handlers) =>
    Effect.gen(function* () {
      const userPreferencesService = yield* UserPreferencesService;

      return handlers
        .handle("getUserPreferences", () =>
          userPreferencesService
            .get()
            .pipe(observeUserPreferencesOperation("getUserPreferences"))
        )
        .handle("updateUserPreferences", ({ payload }) =>
          userPreferencesService
            .update(payload)
            .pipe(observeUserPreferencesOperation("updateUserPreferences"))
        );
    })
);

export const UserPreferencesHttpLive = Layer.mergeAll(
  DomainCorsLive,
  UserPreferencesHandlersLive
).pipe(Layer.provide(UserPreferencesService.Default));
