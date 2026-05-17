import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "../identity/authentication/schema.js";
import { label } from "../labels/schema.js";
import { generateServiceAreaId, generateSiteId } from "./id-generation.js";

const sitesTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

const archivedAtColumn = (name: string) =>
  timestamp(name, { withTimezone: true });

export const serviceArea = pgTable(
  "service_areas",
  {
    id: uuid("id").primaryKey().$defaultFn(generateServiceAreaId),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    slug: text("slug").notNull(),
    createdAt: sitesTimestamp("created_at"),
    updatedAt: sitesTimestamp("updated_at"),
    archivedAt: archivedAtColumn("archived_at"),
  },
  (table) => [
    uniqueIndex("service_areas_organization_slug_idx").on(
      table.organizationId,
      table.slug
    ),
    index("service_areas_organization_name_idx").on(
      table.organizationId,
      table.name
    ),
  ]
);

export const site = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().$defaultFn(generateSiteId),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    serviceAreaId: uuid("service_area_id").references(() => serviceArea.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    addressLine1: text("address_line_1").notNull(),
    addressLine2: text("address_line_2"),
    town: text("town"),
    county: text("county").notNull(),
    country: text("country").notNull().default("IE"),
    eircode: text("eircode"),
    accessNotes: text("access_notes"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    geocodingProvider: text("geocoding_provider").notNull(),
    geocodedAt: timestamp("geocoded_at", { withTimezone: true }).notNull(),
    createdAt: sitesTimestamp("created_at"),
    updatedAt: sitesTimestamp("updated_at"),
    archivedAt: archivedAtColumn("archived_at"),
  },
  (table) => [
    index("sites_organization_updated_at_idx").on(
      table.organizationId,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    index("sites_organization_service_area_idx").on(
      table.organizationId,
      table.serviceAreaId
    ),
    index("sites_service_area_id_idx").on(table.serviceAreaId),
    uniqueIndex("sites_id_organization_idx").on(table.id, table.organizationId),
    index("sites_organization_active_name_idx")
      .on(table.organizationId, table.name.asc().nullsLast(), table.id)
      .where(sql`${table.archivedAt} is null`),
    index("sites_organization_service_area_active_name_idx")
      .on(
        table.organizationId,
        table.serviceAreaId,
        table.name.asc().nullsLast(),
        table.id
      )
      .where(sql`${table.archivedAt} is null`),
    check("sites_country_chk", sql`${table.country} in ('IE', 'GB')`),
    check(
      "sites_ie_eircode_required_chk",
      sql`${table.country} <> 'IE' or ${table.eircode} is not null`
    ),
    check(
      "sites_geocoding_provider_chk",
      sql`${table.geocodingProvider} is null or ${table.geocodingProvider} in ('google', 'stub')`
    ),
    check(
      "sites_coordinates_pair_check",
      sql`(${table.latitude} is null and ${table.longitude} is null) or (${table.latitude} is not null and ${table.longitude} is not null)`
    ),
    check(
      "sites_geocoding_metadata_check",
      sql`(${table.latitude} is null and ${table.longitude} is null and ${table.geocodingProvider} is null and ${table.geocodedAt} is null) or (${table.latitude} is not null and ${table.longitude} is not null and ${table.geocodingProvider} is not null and ${table.geocodedAt} is not null)`
    ),
    check(
      "sites_latitude_range_check",
      sql`${table.latitude} is null or (${table.latitude} >= -90 and ${table.latitude} <= 90)`
    ),
    check(
      "sites_longitude_range_check",
      sql`${table.longitude} is null or (${table.longitude} >= -180 and ${table.longitude} <= 180)`
    ),
  ]
);

export const siteLabel = pgTable(
  "site_labels",
  {
    siteId: uuid("site_id").notNull(),
    labelId: uuid("label_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: sitesTimestamp("created_at"),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.labelId] }),
    foreignKey({
      columns: [table.siteId, table.organizationId],
      foreignColumns: [site.id, site.organizationId],
      name: "site_labels_site_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.labelId, table.organizationId],
      foreignColumns: [label.id, label.organizationId],
      name: "site_labels_label_org_fk",
    }).onDelete("cascade"),
    index("site_labels_label_site_idx").on(
      table.organizationId,
      table.labelId,
      table.siteId
    ),
    index("site_labels_site_label_idx").on(
      table.organizationId,
      table.siteId,
      table.labelId
    ),
  ]
);

export const sitesSchema = {
  serviceArea,
  site,
  siteLabel,
};
