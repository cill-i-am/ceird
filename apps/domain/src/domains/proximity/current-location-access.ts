import type { UserId } from "@ceird/identity-core";
import { ProximityAccessDeniedError } from "@ceird/proximity-core";
import type { ProximityOriginInput } from "@ceird/proximity-core";
import type { Context } from "effect";
import { Effect } from "effect";

import type { UserPreferencesRepository } from "../identity/preferences/repository.js";

type UserPreferencesRepositoryService = Context.Service.Shape<
  typeof UserPreferencesRepository
>;

export function ensureCurrentLocationOriginAllowed(input: {
  readonly origin: ProximityOriginInput;
  readonly userId: UserId;
  readonly userPreferencesRepository: UserPreferencesRepositoryService;
}): Effect.Effect<void, ProximityAccessDeniedError> {
  if (input.origin.mode !== "current_location") {
    return Effect.void;
  }

  return input.userPreferencesRepository.get(input.userId).pipe(
    Effect.mapError(
      () =>
        new ProximityAccessDeniedError({
          message: "Current location access could not be verified.",
        })
    ),
    Effect.flatMap((preferences) =>
      preferences.routeProximityLocationEnabled
        ? Effect.void
        : Effect.fail(
            new ProximityAccessDeniedError({
              message: "Current location access is disabled for this user.",
            })
          )
    )
  );
}
