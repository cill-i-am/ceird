import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
