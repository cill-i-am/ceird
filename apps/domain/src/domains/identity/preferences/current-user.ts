import {
  UserId,
  UserPreferencesAccessDeniedError,
  UserPreferencesStorageError,
} from "@ceird/identity-core";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpServerRequest } from "effect/unstable/http";

import { Authentication } from "../authentication/auth.js";

interface CurrentUserSession {
  readonly user: {
    readonly id: string;
  };
}

export const resolveCurrentUserId = Effect.fn("CurrentUser.resolve")(
  function* (options: {
    readonly headers: Headers;
    readonly getSession: (
      headers: Headers
    ) => Promise<CurrentUserSession | null>;
  }) {
    const session = yield* Effect.tryPromise({
      try: () => options.getSession(options.headers),
      catch: (cause) =>
        new UserPreferencesStorageError({
          cause: formatUnknownError(cause),
          message: "User preferences session lookup failed",
        }),
    });

    if (session === null) {
      return yield* Effect.fail(
        new UserPreferencesAccessDeniedError({
          message: "Authentication is required to manage user preferences",
        })
      );
    }

    return yield* Schema.decodeUnknownEffect(UserId)(session.user.id).pipe(
      Effect.catchTag("SchemaError", (parseError) =>
        Effect.fail(
          new UserPreferencesAccessDeniedError({
            message: parseError.message,
          })
        )
      )
    );
  }
);

export class CurrentUser extends Context.Service<CurrentUser>()(
  "@ceird/domains/identity/preferences/CurrentUser",
  {
    make: Effect.gen(function* CurrentUserLive() {
      const auth = yield* Authentication;

      const get = Effect.fn("CurrentUser.get")(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;

        return yield* resolveCurrentUserId({
          getSession: async (headers) =>
            (await auth.api.getSession({ headers })) ?? null,
          headers: new Headers(request.headers),
        });
      });

      return { get };
    }),
  }
) {
  static readonly get = (
    ...args: Parameters<Context.Service.Shape<typeof CurrentUser>["get"]>
  ) => CurrentUser.use((service) => service.get(...args));
  static readonly DefaultWithoutDependencies = Layer.effect(
    CurrentUser,
    CurrentUser.make
  );
  static readonly Default = CurrentUser.DefaultWithoutDependencies.pipe(
    Layer.provide(Authentication.Default)
  );
}

function formatUnknownError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown session lookup error";
}
