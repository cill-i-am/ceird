import { UserPreferencesStorageError } from "@ceird/identity-core";
import type { UserId, UserPreferences } from "@ceird/identity-core";
import { eq, sql } from "drizzle-orm";
import { Context, Effect, Layer, Schema } from "effect";

import {
  describeDomainStorageFailure,
  DomainDrizzle,
} from "../../../platform/database/database.js";
import { userPreferences } from "../../../platform/database/schema.js";
import {
  InsertUserPreferencesRowSchema,
  PatchUserPreferencesRowSchema,
  PublicUserPreferencesReadSchema,
  SelectedUserPreferencesRowSchema,
  UserPreferencesRowSchema,
} from "./schema.js";
import type {
  PatchUserPreferencesRow,
  SelectedUserPreferencesRow,
  UserPreferencesRow,
} from "./schema.js";

export class UserPreferencesRepository extends Context.Service<UserPreferencesRepository>()(
  "@ceird/domains/identity/preferences/UserPreferencesRepository",
  {
    make: Effect.gen(function* UserPreferencesRepositoryLive() {
      const { db } = yield* DomainDrizzle;

      const get = Effect.fn("UserPreferencesRepository.get")(function* (
        userId: UserId
      ) {
        const existingRow = yield* selectUserPreferencesRow(userId);

        if (existingRow !== undefined) {
          return yield* mapUserPreferencesRow(existingRow);
        }

        const insert = yield* decodeInsertUserPreferencesRow({ userId });
        const insertedRows = yield* db
          .insert(userPreferences)
          .values(insert)
          .onConflictDoNothing({ target: userPreferences.userId })
          .returning(userPreferencesSelection)
          .pipe(
            Effect.catchTag(
              "EffectDrizzleQueryError",
              failUserPreferencesStorage
            )
          );
        const [insertedRow] = insertedRows;

        if (insertedRow !== undefined) {
          return yield* mapUserPreferencesRow(
            yield* decodeUserPreferencesRow(insertedRow)
          );
        }

        return yield* mapUserPreferencesRow(
          yield* getRequiredRow(
            yield* selectUserPreferencesRows(userId),
            "materialized user preferences"
          )
        );
      });

      const update = Effect.fn("UserPreferencesRepository.update")(function* (
        input: PatchUserPreferencesRow
      ) {
        const patch = yield* decodePatchUserPreferencesRow(input);
        const rows = yield* db
          .insert(userPreferences)
          .values({
            routeProximityLocationEnabled: patch.routeProximityLocationEnabled,
            userId: patch.userId,
          })
          .onConflictDoUpdate({
            set: {
              routeProximityLocationEnabled:
                patch.routeProximityLocationEnabled,
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

        return yield* mapUserPreferencesRow(
          yield* decodeUserPreferencesRow(
            yield* getRequiredRow(rows, "updated user preferences")
          )
        );
      });

      function selectUserPreferencesRows(userId: UserId) {
        return db
          .select(userPreferencesSelection)
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .limit(1)
          .pipe(
            Effect.catchTag(
              "EffectDrizzleQueryError",
              failUserPreferencesStorage
            ),
            Effect.flatMap((rows) =>
              Effect.all(rows.map((row) => decodeUserPreferencesRow(row)))
            )
          );
      }

      function selectUserPreferencesRow(userId: UserId) {
        return selectUserPreferencesRows(userId).pipe(
          Effect.map((rows) => rows[0])
        );
      }

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

function mapUserPreferencesRow(
  row: UserPreferencesRow
): Effect.Effect<UserPreferences, UserPreferencesStorageError> {
  return decodePublicUserPreferencesRead({
    routeProximityLocationEnabled: row.routeProximityLocationEnabled,
    updatedAt: row.updatedAt,
  });
}

const userPreferencesSelection = {
  routeProximityLocationEnabled: userPreferences.routeProximityLocationEnabled,
  createdAt: userPreferences.createdAt,
  updatedAt: userPreferences.updatedAt,
  userId: userPreferences.userId,
};

const decodeInsertUserPreferencesRow = decodePreferenceBoundary(
  "insert row",
  InsertUserPreferencesRowSchema
);
const decodePatchUserPreferencesRow = decodePreferenceBoundary(
  "patch row",
  PatchUserPreferencesRowSchema
);
const decodePublicUserPreferencesRead = decodePreferenceBoundary(
  "public read",
  PublicUserPreferencesReadSchema
);
const decodeSelectedUserPreferencesRow = decodePreferenceBoundary(
  "selected row",
  SelectedUserPreferencesRowSchema
);
const decodeUserPreferencesRowSchema = decodePreferenceBoundary(
  "persisted row",
  UserPreferencesRowSchema
);

function decodeUserPreferencesRow(
  input: unknown
): Effect.Effect<UserPreferencesRow, UserPreferencesStorageError> {
  return Effect.gen(function* () {
    const row: SelectedUserPreferencesRow =
      yield* decodeSelectedUserPreferencesRow(input);

    return yield* decodeUserPreferencesRowSchema({
      createdAt: row.createdAt.toISOString(),
      routeProximityLocationEnabled: row.routeProximityLocationEnabled,
      updatedAt: row.updatedAt.toISOString(),
      userId: row.userId,
    });
  });
}

function decodePreferenceBoundary<SchemaType extends Schema.Top>(
  description: string,
  schema: SchemaType
) {
  return (input: unknown) =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError(
        (error) =>
          new UserPreferencesStorageError({
            cause: error.message,
            message: `User preferences ${description} decode failed`,
          })
      )
    );
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
      cause: describeDomainStorageFailure(error),
      message: "User preferences storage operation failed",
    })
  );
}
