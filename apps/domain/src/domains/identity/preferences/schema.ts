import {
  IsoDateTimeString,
  UpdateUserPreferencesInputSchema,
  UserId,
  UserPreferencesSchema,
} from "@ceird/identity-core";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { Schema } from "effect";

import { user } from "../authentication/schema.js";

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  routeProximityLocationEnabled: boolean("route_proximity_location_enabled")
    .default(false)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const identityPreferencesSchema = {
  userPreferences,
};

const UserPreferencesPersistenceFields = {
  routeProximityLocationEnabled: Schema.Boolean,
  userId: UserId,
} as const;

export const UserPreferencesRowSchema = Schema.Struct({
  ...UserPreferencesPersistenceFields,
  createdAt: IsoDateTimeString,
  updatedAt: IsoDateTimeString,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type UserPreferencesRow = Schema.Schema.Type<
  typeof UserPreferencesRowSchema
>;

export const SelectedUserPreferencesRowSchema = Schema.Struct({
  ...UserPreferencesPersistenceFields,
  createdAt: Schema.DateValid,
  updatedAt: Schema.DateValid,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type SelectedUserPreferencesRow = Schema.Schema.Type<
  typeof SelectedUserPreferencesRowSchema
>;

export const InsertUserPreferencesRowSchema = Schema.Struct({
  userId: UserPreferencesPersistenceFields.userId,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type InsertUserPreferencesRow = Schema.Schema.Type<
  typeof InsertUserPreferencesRowSchema
>;

export const PatchUserPreferencesRowSchema = Schema.Struct({
  ...UserPreferencesPersistenceFields,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type PatchUserPreferencesRow = Schema.Schema.Type<
  typeof PatchUserPreferencesRowSchema
>;

export const PublicUserPreferencesReadSchema = UserPreferencesSchema;
export const PublicUserPreferencesPatchSchema =
  UpdateUserPreferencesInputSchema;
