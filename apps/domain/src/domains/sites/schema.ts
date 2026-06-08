import {
  SITE_COUNTRIES,
  SITE_LOCATION_PROVIDERS,
  SITE_LOCATION_STATUSES,
  GOOGLE_PLACE_ID_MAX_LENGTH,
} from "@ceird/sites-core";
import type {
  GoogleAddressComponent,
  GooglePlaceIdType,
  SiteCountry,
  SiteLatitude,
  SiteLocationProviderType,
  SiteLocationStatusType,
  SiteLongitude,
} from "@ceird/sites-core";
import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "../identity/authentication/schema.js";
import { label } from "../labels/schema.js";
import { generateSiteId } from "./id-generation.js";

const sitesTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

const archivedAtColumn = (name: string) =>
  timestamp(name, { withTimezone: true });

const siteCountryValuesSql = sql.raw(
  SITE_COUNTRIES.map((value) => `'${value}'`).join(", ")
);
const siteLocationStatusValuesSql = sql.raw(
  SITE_LOCATION_STATUSES.map((value) => `'${value}'`).join(", ")
);
const siteLocationProviderValuesSql = sql.raw(
  SITE_LOCATION_PROVIDERS.map((value) => `'${value}'`).join(", ")
);
const googlePlaceIdMaxLengthSql = sql.raw(String(GOOGLE_PLACE_ID_MAX_LENGTH));

export const site = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().$defaultFn(generateSiteId),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    town: text("town"),
    county: text("county"),
    country: text("country").$type<SiteCountry>(),
    eircode: text("eircode"),
    accessNotes: text("access_notes"),
    rawLocationInput: text("raw_location_input"),
    displayLocation: text("display_location").notNull().default(""),
    formattedAddress: text("formatted_address"),
    googlePlaceId: text("google_place_id").$type<GooglePlaceIdType>(),
    addressComponents:
      jsonb("address_components").$type<readonly GoogleAddressComponent[]>(),
    latitude: doublePrecision("latitude").$type<SiteLatitude>(),
    longitude: doublePrecision("longitude").$type<SiteLongitude>(),
    locationProvider:
      text("location_provider").$type<SiteLocationProviderType>(),
    locationResolvedAt: timestamp("location_resolved_at", {
      withTimezone: true,
    }),
    locationStatus: text("location_status")
      .$type<SiteLocationStatusType>()
      .notNull()
      .default("unverified"),
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
    index("sites_organization_routeable_updated_at_idx")
      .on(table.organizationId, table.updatedAt.desc(), table.id.desc())
      .where(
        sql`${table.archivedAt} is null and ${table.locationStatus} in ('google_resolved', 'manually_adjusted', 'validated') and ${table.latitude} is not null and ${table.longitude} is not null`
      ),
    uniqueIndex("sites_id_organization_idx").on(table.id, table.organizationId),
    index("sites_organization_active_name_idx")
      .on(table.organizationId, table.name.asc().nullsLast(), table.id)
      .where(sql`${table.archivedAt} is null`),
    check(
      "sites_country_chk",
      sql`${table.country} is null or ${table.country} in (${siteCountryValuesSql})`
    ),
    check(
      "sites_location_status_chk",
      sql`${table.locationStatus} in (${siteLocationStatusValuesSql})`
    ),
    check(
      "sites_location_provider_chk",
      sql`${table.locationProvider} is null or ${table.locationProvider} in (${siteLocationProviderValuesSql})`
    ),
    check(
      "sites_coordinates_pair_check",
      sql`(${table.latitude} is null and ${table.longitude} is null) or (${table.latitude} is not null and ${table.longitude} is not null)`
    ),
    check(
      "sites_google_resolved_metadata_check",
      sql`${table.locationStatus} <> 'google_resolved' or (${table.latitude} is not null and ${table.longitude} is not null and ${table.locationProvider} is not null and ${table.locationResolvedAt} is not null and ${table.googlePlaceId} is not null)`
    ),
    check(
      "sites_google_place_id_format_chk",
      sql`${table.googlePlaceId} is null or (length(${table.googlePlaceId}) >= 1 and length(${table.googlePlaceId}) <= ${googlePlaceIdMaxLengthSql} and ${table.googlePlaceId} ~ '^[A-Za-z0-9_-]+$')`
    ),
    check(
      "sites_unverified_location_metadata_check",
      sql`${table.locationStatus} <> 'unverified' or (${table.latitude} is null and ${table.longitude} is null and ${table.locationProvider} is null and ${table.locationResolvedAt} is null and ${table.googlePlaceId} is null)`
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
  site,
  siteLabel,
};
