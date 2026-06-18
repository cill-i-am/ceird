import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "../identity/authentication/schema.js";
import { generateLabelId } from "./id-generation.js";

const labelTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

const archivedAtColumn = (name: string) =>
  timestamp(name, { withTimezone: true });

const labelNameMaxLength = 48;
const labelDescriptionMaxLength = 280;

export const label = pgTable(
  "labels",
  {
    id: uuid("id").primaryKey().$defaultFn(generateLabelId),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    color: text("color").notNull(),
    description: text("description"),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: labelTimestamp("created_at"),
    updatedAt: labelTimestamp("updated_at"),
    archivedAt: archivedAtColumn("archived_at"),
  },
  (table) => [
    uniqueIndex("labels_organization_normalized_active_idx")
      .on(table.organizationId, table.normalizedName)
      .where(sql`${table.archivedAt} is null`),
    uniqueIndex("labels_id_organization_idx").on(
      table.id,
      table.organizationId
    ),
    index("labels_organization_id_idx").on(table.organizationId),
    index("labels_organization_name_idx")
      .on(table.organizationId, table.name, table.id)
      .where(sql`${table.archivedAt} is null`),
    check("labels_name_not_empty_chk", sql`length(trim(${table.name})) > 0`),
    check(
      "labels_name_max_length_chk",
      sql`length(trim(${table.name})) <= ${sql.raw(String(labelNameMaxLength))}`
    ),
    check(
      "labels_normalized_name_not_empty_chk",
      sql`length(trim(${table.normalizedName})) > 0`
    ),
    check(
      "labels_normalized_name_max_length_chk",
      sql`length(trim(${table.normalizedName})) <= ${sql.raw(String(labelNameMaxLength))}`
    ),
    check(
      "labels_color_oklch_chk",
      sql`${table.color} ~ '^oklch\\([0-9]+(\\.[0-9]+)?% [0-9]+(\\.[0-9]+)? [0-9]+(\\.[0-9]+)?\\)$'`
    ),
    check(
      "labels_description_max_length_chk",
      sql`${table.description} is null OR length(trim(${table.description})) <= ${sql.raw(String(labelDescriptionMaxLength))}`
    ),
  ]
);

export const labelsSchema = {
  label,
};
