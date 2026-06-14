import {
  decodeUserPreferences,
  UserPreferencesStorageError,
} from "@ceird/identity-core";
import type { UserId, UserPreferences } from "@ceird/identity-core";
import { eq, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import {
  describeDomainStorageFailure,
  DomainDrizzle,
} from "../../../platform/database/database.js";
import { userPreferences } from "../../../platform/database/schema.js";

const DEFAULT_USER_PREFERENCES_UPDATED_AT = "1970-01-01T00:00:00.000Z";

interface UserPreferencesRow {
  readonly routeProximityLocationEnabled: boolean;
  readonly updatedAt: Date;
}

export interface UpdateUserPreferencesRecordInput {
  readonly routeProximityLocationEnabled: boolean;
  readonly userId: UserId;
}

export class UserPreferencesRepository extends Context.Service<UserPreferencesRepository>()(
  "@ceird/domains/identity/preferences/UserPreferencesRepository",
  {
    make: Effect.gen(function* UserPreferencesRepositoryLive() {
      const { db } = yield* DomainDrizzle;

      const get = Effect.fn("UserPreferencesRepository.get")(function* (
        userId: UserId
      ) {
        const rows = yield* db
          .select(userPreferencesSelection)
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .limit(1)
          .pipe(
            Effect.catchTag(
              "EffectDrizzleQueryError",
              failUserPreferencesStorage
            )
          );

        return rows[0] === undefined
          ? makeDefaultUserPreferences()
          : mapUserPreferencesRow(rows[0]);
      });

      const update = Effect.fn("UserPreferencesRepository.update")(function* (
        input: UpdateUserPreferencesRecordInput
      ) {
        const rows = yield* db
          .insert(userPreferences)
          .values({
            routeProximityLocationEnabled: input.routeProximityLocationEnabled,
            userId: input.userId,
          })
          .onConflictDoUpdate({
            set: {
              routeProximityLocationEnabled:
                input.routeProximityLocationEnabled,
              updatedAt: sql`now()`,
            },
            target: userPreferences.userId,
          })
          .returning(userPreferencesSelection)
          .pipe(
            Effect.catchTag(
              "EffectDrizzleQueryError",
              failUserPreferencesStorage
            )
          );

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
    routeProximityLocationEnabled: row.routeProximityLocationEnabled,
    updatedAt: row.updatedAt.toISOString(),
  });
}

const userPreferencesSelection = {
  routeProximityLocationEnabled: userPreferences.routeProximityLocationEnabled,
  updatedAt: userPreferences.updatedAt,
} satisfies Record<keyof UserPreferencesRow, unknown>;

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
      cause: describeDomainStorageFailure(error),
      message: "User preferences storage operation failed",
    })
  );
}
