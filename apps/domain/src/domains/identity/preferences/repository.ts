import {
  decodeUserPreferences,
  UserPreferencesStorageError,
} from "@ceird/identity-core";
import type { UserId, UserPreferences } from "@ceird/identity-core";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

const DEFAULT_USER_PREFERENCES_UPDATED_AT = "1970-01-01T00:00:00.000Z";

interface UserPreferencesRow {
  readonly route_proximity_location_enabled: boolean;
  readonly updated_at: Date;
}

export interface UpdateUserPreferencesRecordInput {
  readonly routeProximityLocationEnabled: boolean;
  readonly userId: UserId;
}

export class UserPreferencesRepository extends Context.Service<UserPreferencesRepository>()(
  "@ceird/domains/identity/preferences/UserPreferencesRepository",
  {
    make: Effect.gen(function* UserPreferencesRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const get = Effect.fn("UserPreferencesRepository.get")(function* (
        userId: UserId
      ) {
        const rows = yield* sql<UserPreferencesRow>`
          select route_proximity_location_enabled, updated_at
          from user_preferences
          where user_id = ${userId}
          limit 1
        `.pipe(Effect.catchTag("SqlError", failUserPreferencesStorage));

        return rows[0] === undefined
          ? makeDefaultUserPreferences()
          : mapUserPreferencesRow(rows[0]);
      });

      const update = Effect.fn("UserPreferencesRepository.update")(function* (
        input: UpdateUserPreferencesRecordInput
      ) {
        const rows = yield* sql<UserPreferencesRow>`
          insert into user_preferences ${sql.insert({
            route_proximity_location_enabled:
              input.routeProximityLocationEnabled,
            user_id: input.userId,
          })}
          on conflict (user_id) do update
          set route_proximity_location_enabled = excluded.route_proximity_location_enabled,
              updated_at = now()
          returning route_proximity_location_enabled, updated_at
        `.pipe(Effect.catchTag("SqlError", failUserPreferencesStorage));

        return mapUserPreferencesRow(
          yield* getRequiredRow(rows, "updated user preferences")
        );
      });

      return { get, update };
    }),
  }
) {
  static readonly get = (
    ...args: Parameters<
      Context.Service.Shape<typeof UserPreferencesRepository>["get"]
    >
  ) => UserPreferencesRepository.use((service) => service.get(...args));
  static readonly update = (
    ...args: Parameters<
      Context.Service.Shape<typeof UserPreferencesRepository>["update"]
    >
  ) => UserPreferencesRepository.use((service) => service.update(...args));
  static readonly DefaultWithoutDependencies = Layer.effect(
    UserPreferencesRepository,
    UserPreferencesRepository.make
  );
  static readonly Default =
    UserPreferencesRepository.DefaultWithoutDependencies;
}

function makeDefaultUserPreferences(): UserPreferences {
  return decodeUserPreferences({
    routeProximityLocationEnabled: false,
    updatedAt: DEFAULT_USER_PREFERENCES_UPDATED_AT,
  });
}

function mapUserPreferencesRow(row: UserPreferencesRow): UserPreferences {
  return decodeUserPreferences({
    routeProximityLocationEnabled: row.route_proximity_location_enabled,
    updatedAt: row.updated_at.toISOString(),
  });
}

function getRequiredRow<Row>(
  rows: readonly Row[],
  description: string
): Effect.Effect<Row, UserPreferencesStorageError> {
  const [row] = rows;

  return row === undefined
    ? Effect.fail(
        new UserPreferencesStorageError({
          message: `Expected ${description} to return a row`,
        })
      )
    : Effect.succeed(row);
}

function failUserPreferencesStorage(error: unknown) {
  return Effect.fail(
    new UserPreferencesStorageError({
      cause: error instanceof Error ? error.message : String(error),
      message: "User preferences storage operation failed",
    })
  );
}
