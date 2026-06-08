import {
  decodeUserId,
  UserPreferencesAccessDeniedError,
  UserPreferencesStorageError,
} from "@ceird/identity-core";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { HttpServerRequest } from "effect/unstable/http";

import { CurrentUser, resolveCurrentUserId } from "./current-user.js";
import { UserPreferencesRepository } from "./repository.js";
import { UserPreferencesService } from "./service.js";

const userId = decodeUserId("user_123");
const defaultUpdatedAt = "2026-06-06T10:00:00.000Z";

describe("user preferences service", () => {
  it("resolves the current user from an authenticated session", async () => {
    const exit = await Effect.runPromiseExit(
      resolveCurrentUserId({
        getSession: () =>
          Promise.resolve({
            user: { id: "user_123" },
          }),
        headers: new Headers(),
      })
    );

    expect(exit).toStrictEqual(Exit.succeed(userId));
  }, 10_000);

  it("fails closed when no authenticated session exists", async () => {
    const exit = await Effect.runPromiseExit(
      resolveCurrentUserId({
        getSession: () => Promise.resolve(null),
        headers: new Headers(),
      })
    );

    expect(exit._tag).toBe("Failure");

    if (Exit.isSuccess(exit)) {
      throw new Error("Expected current user lookup to fail.");
    }

    const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

    expect(failure).toBeInstanceOf(UserPreferencesAccessDeniedError);
    expect(failure).toMatchObject({
      message: "Authentication is required to manage user preferences",
    });
  }, 10_000);

  it("maps auth lookup failures to a storage error", async () => {
    const exit = await Effect.runPromiseExit(
      resolveCurrentUserId({
        getSession: () => Promise.reject(new Error("auth unavailable")),
        headers: new Headers(),
      })
    );

    expect(exit._tag).toBe("Failure");

    if (Exit.isSuccess(exit)) {
      throw new Error("Expected current user lookup to fail.");
    }

    const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

    expect(failure).toBeInstanceOf(UserPreferencesStorageError);
    expect(failure).toMatchObject({
      cause: "auth unavailable",
      message: "User preferences session lookup failed",
    });
  }, 10_000);

  it("loads preferences for the current user", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* UserPreferencesService;

        return yield* service.get();
      }).pipe(
        Effect.provide(UserPreferencesService.DefaultWithoutDependencies),
        Effect.provide(makeCurrentUserLayer()),
        Effect.provide(makeHttpServerRequestLayer()),
        Effect.provide(
          makeRepositoryLayer({
            get: (requestedUserId) => {
              expect(requestedUserId).toBe(userId);

              return Effect.succeed({
                routeProximityLocationEnabled: false,
                updatedAt: defaultUpdatedAt,
              });
            },
          })
        )
      )
    );

    expect(result).toStrictEqual({
      preferences: {
        routeProximityLocationEnabled: false,
        updatedAt: defaultUpdatedAt,
      },
    });
  }, 10_000);

  it("updates route proximity location preference without coordinate state", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* UserPreferencesService;

        return yield* service.update({
          routeProximityLocationEnabled: true,
        });
      }).pipe(
        Effect.provide(UserPreferencesService.DefaultWithoutDependencies),
        Effect.provide(makeCurrentUserLayer()),
        Effect.provide(makeHttpServerRequestLayer()),
        Effect.provide(
          makeRepositoryLayer({
            update: (input) => {
              expect(input).toStrictEqual({
                routeProximityLocationEnabled: true,
                userId,
              });

              return Effect.succeed({
                routeProximityLocationEnabled: true,
                updatedAt: "2026-06-06T10:01:00.000Z",
              });
            },
          })
        )
      )
    );

    expect(result).toStrictEqual({
      preferences: {
        routeProximityLocationEnabled: true,
        updatedAt: "2026-06-06T10:01:00.000Z",
      },
    });
  }, 10_000);
});

function makeCurrentUserLayer() {
  return Layer.succeed(
    CurrentUser,
    CurrentUser.of({
      get: () => Effect.succeed(userId),
    })
  );
}

function makeHttpServerRequestLayer() {
  return Layer.succeed(
    HttpServerRequest.HttpServerRequest,
    {} as HttpServerRequest.HttpServerRequest
  );
}

function makeRepositoryLayer(
  handlers: Partial<{
    readonly get: Parameters<typeof UserPreferencesRepository.of>[0]["get"];
    readonly update: Parameters<
      typeof UserPreferencesRepository.of
    >[0]["update"];
  }>
) {
  return Layer.succeed(
    UserPreferencesRepository,
    UserPreferencesRepository.of({
      get:
        handlers.get ??
        (() =>
          Effect.succeed({
            routeProximityLocationEnabled: false,
            updatedAt: defaultUpdatedAt,
          })),
      update:
        handlers.update ??
        (() =>
          Effect.succeed({
            routeProximityLocationEnabled: false,
            updatedAt: defaultUpdatedAt,
          })),
    })
  );
}
