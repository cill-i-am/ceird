import type {
  UpdateUserPreferencesInput,
  UserPreferencesResponse,
} from "@ceird/identity-core";
import { Context, Effect, Layer } from "effect";

import { CurrentUser } from "./current-user.js";
import { UserPreferencesRepository } from "./repository.js";

export class UserPreferencesService extends Context.Service<UserPreferencesService>()(
  "@ceird/domains/identity/preferences/UserPreferencesService",
  {
    make: Effect.gen(function* UserPreferencesServiceLive() {
      const currentUser = yield* CurrentUser;
      const repository = yield* UserPreferencesRepository;

      const get = Effect.fn("UserPreferencesService.get")(function* () {
        const userId = yield* currentUser.get();
        const preferences = yield* repository.get(userId);

        return { preferences } satisfies UserPreferencesResponse;
      });

      const update = Effect.fn("UserPreferencesService.update")(function* (
        input: UpdateUserPreferencesInput
      ) {
        const userId = yield* currentUser.get();
        const preferences = yield* repository.update({
          routeProximityLocationEnabled: input.routeProximityLocationEnabled,
          userId,
        });

        return { preferences } satisfies UserPreferencesResponse;
      });

      return { get, update };
    }),
  }
) {
  static readonly get = (
    ...args: Parameters<
      Context.Service.Shape<typeof UserPreferencesService>["get"]
    >
  ) => UserPreferencesService.use((service) => service.get(...args));
  static readonly update = (
    ...args: Parameters<
      Context.Service.Shape<typeof UserPreferencesService>["update"]
    >
  ) => UserPreferencesService.use((service) => service.update(...args));
  static readonly DefaultWithoutDependencies = Layer.effect(
    UserPreferencesService,
    UserPreferencesService.make
  );
  static readonly Default =
    UserPreferencesService.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.mergeAll(CurrentUser.Default, UserPreferencesRepository.Default)
      )
    );
}
