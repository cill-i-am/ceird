import type { UserId } from "@ceird/identity-core";
import {
  ProximityAccessDeniedError,
  verifyProximityOriginToken,
} from "@ceird/proximity-core";
import type { ProximityOriginInput } from "@ceird/proximity-core";
import type { Context } from "effect";
import { Config, Effect } from "effect";

import type { UserPreferencesRepository } from "../identity/preferences/repository.js";

type UserPreferencesRepositoryService = Context.Service.Shape<
  typeof UserPreferencesRepository
>;

export const RouteProximityOriginAccessConfig = Config.all({
  originTokenSecret: Config.string("AGENT_INTERNAL_SECRET"),
});

export function ensureCurrentLocationOriginAllowed(input: {
  readonly origin: ProximityOriginInput;
  readonly userId: UserId;
  readonly userPreferencesRepository: UserPreferencesRepositoryService;
}): Effect.Effect<void, ProximityAccessDeniedError> {
  const { origin } = input;

  if (origin.mode === "typed_origin") {
    return Effect.gen(function* () {
      const config = yield* RouteProximityOriginAccessConfig.pipe(
        Effect.mapError(
          () =>
            new ProximityAccessDeniedError({
              message: "Typed origin access could not be verified.",
            })
        )
      );

      yield* Effect.tryPromise({
        catch: () =>
          new ProximityAccessDeniedError({
            message: "Typed origin access could not be verified.",
          }),
        try: () =>
          verifyProximityOriginToken({
            origin: {
              coordinates: origin.coordinates,
              displayText: origin.displayText,
              mode: origin.mode,
              placeId: origin.placeId,
            },
            secret: config.originTokenSecret,
            token: origin.originToken,
          }),
      });
    });
  }

  if (origin.mode !== "current_location") {
    return Effect.fail(
      new ProximityAccessDeniedError({
        message: "Proximity origin access could not be verified.",
      })
    );
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
