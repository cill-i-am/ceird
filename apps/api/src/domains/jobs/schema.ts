import type { JobActivityPayload } from "@task-tracker/jobs-core";
import {
  JOB_ACTIVITY_EVENT_TYPES,
  JOB_KINDS,
  JOB_PRIORITIES,
  JOB_STATUSES,
} from "@task-tracker/jobs-core";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization, user } from "../identity/authentication/schema.js";
import { generateJobDomainUuid } from "./id-generation.js";

const jobsTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

const archivedAtColumn = (name: string) =>
  timestamp(name, { withTimezone: true });

const priorityValuesSql = sql.raw(
  JOB_PRIORITIES.map((value) => `'${value}'`).join(", ")
);
const statusValuesSql = sql.raw(
  JOB_STATUSES.map((value) => `'${value}'`).join(", ")
);
const kindValuesSql = sql.raw(
  JOB_KINDS.map((value) => `'${value}'`).join(", ")
);
const activityEventTypeValuesSql = sql.raw(
  JOB_ACTIVITY_EVENT_TYPES.map((value) => `'${value}'`).join(", ")
);

export const serviceRegion = pgTable(
  "service_regions",
  {
    id: uuid("id").primaryKey().$defaultFn(generateJobDomainUuid),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: jobsTimestamp("created_at"),
    updatedAt: jobsTimestamp("updated_at"),
    archivedAt: archivedAtColumn("archived_at"),
  },
  (table) => [
    uniqueIndex("service_regions_organization_slug_idx").on(
      table.organizationId,
      table.slug
    ),
    index("service_regions_organization_name_idx").on(
      table.organizationId,
      table.name
    ),
  ]
);

export const site = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().$defaultFn(generateJobDomainUuid),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    regionId: uuid("region_id").references(() => serviceRegion.id, {
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
    createdAt: jobsTimestamp("created_at"),
    updatedAt: jobsTimestamp("updated_at"),
    archivedAt: archivedAtColumn("archived_at"),
  },
  (table) => [
    index("sites_organization_updated_at_idx").on(
      table.organizationId,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    index("sites_organization_region_idx").on(
      table.organizationId,
      table.regionId
    ),
    index("sites_organization_active_name_idx")
      .on(
        table.organizationId,
        table.name.asc().nullsLast(),
        table.createdAt,
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

export const contact = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().$defaultFn(generateJobDomainUuid),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    createdAt: jobsTimestamp("created_at"),
    updatedAt: jobsTimestamp("updated_at"),
    archivedAt: archivedAtColumn("archived_at"),
  },
  (table) => [
    index("contacts_organization_name_idx").on(
      table.organizationId,
      table.name
    ),
    index("contacts_organization_email_idx").on(
      table.organizationId,
      table.email
    ),
  ]
);

export const siteContact = pgTable(
  "site_contacts",
  {
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: jobsTimestamp("created_at"),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.contactId] }),
    index("site_contacts_contact_site_idx").on(table.contactId, table.siteId),
    uniqueIndex("site_contacts_primary_site_idx")
      .on(table.siteId)
      .where(sql`${table.isPrimary} = true`),
  ]
);

export const workItem = pgTable(
  "work_items",
  {
    id: uuid("id").primaryKey().$defaultFn(generateJobDomainUuid),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    externalReference: text("external_reference"),
    status: text("status").notNull(),
    priority: text("priority").notNull().default("none"),
    siteId: uuid("site_id").references(() => site.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contact.id, {
      onDelete: "set null",
    }),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    coordinatorId: text("coordinator_id").references(() => user.id, {
      onDelete: "set null",
    }),
    blockedReason: text("blocked_reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByUserId: text("completed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: jobsTimestamp("created_at"),
    updatedAt: jobsTimestamp("updated_at"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
  },
  (table) => [
    check("work_items_kind_chk", sql`${table.kind} in (${kindValuesSql})`),
    check(
      "work_items_status_chk",
      sql`${table.status} in (${statusValuesSql})`
    ),
    check(
      "work_items_priority_chk",
      sql`${table.priority} in (${priorityValuesSql})`
    ),
    check(
      "work_items_blocked_reason_matches_status_chk",
      sql`(${table.status} = 'blocked' and ${table.blockedReason} is not null) or (${table.status} <> 'blocked' and ${table.blockedReason} is null)`
    ),
    check(
      "work_items_coordinator_not_assignee_chk",
      sql`${table.coordinatorId} is null or ${table.coordinatorId} <> ${table.assigneeId}`
    ),
    check(
      "work_items_completed_at_matches_status_chk",
      sql`(${table.status} = 'completed' and ${table.completedAt} is not null) or (${table.status} <> 'completed' and ${table.completedAt} is null)`
    ),
    check(
      "work_items_completed_by_matches_status_chk",
      sql`(${table.status} = 'completed' and ${table.completedByUserId} is not null) or (${table.status} <> 'completed' and ${table.completedByUserId} is null)`
    ),
    index("work_items_organization_updated_at_idx").on(
      table.organizationId,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    index("work_items_organization_status_updated_at_idx").on(
      table.organizationId,
      table.status,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    index("work_items_organization_external_reference_idx").on(
      table.organizationId,
      table.externalReference
    ),
    index("work_items_organization_assignee_updated_at_idx").on(
      table.organizationId,
      table.assigneeId,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    index("work_items_organization_coordinator_updated_at_idx").on(
      table.organizationId,
      table.coordinatorId,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    index("work_items_organization_site_updated_at_idx").on(
      table.organizationId,
      table.siteId,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    index("work_items_organization_active_updated_at_idx")
      .on(table.organizationId, table.updatedAt.desc(), table.id.desc())
      .where(sql`${table.status} not in ('completed', 'canceled')`),
  ]
);

export const workItemComment = pgTable(
  "work_item_comments",
  {
    id: uuid("id").primaryKey().$defaultFn(generateJobDomainUuid),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id),
    body: text("body").notNull(),
    createdAt: jobsTimestamp("created_at"),
  },
  (table) => [
    index("work_item_comments_work_item_created_at_idx").on(
      table.workItemId,
      table.createdAt.asc(),
      table.id.asc()
    ),
  ]
);

export const workItemActivity = pgTable(
  "work_item_activity",
  {
    id: uuid("id").primaryKey().$defaultFn(generateJobDomainUuid),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload").$type<JobActivityPayload>().notNull(),
    createdAt: jobsTimestamp("created_at"),
  },
  (table) => [
    check(
      "work_item_activity_event_type_chk",
      sql`${table.eventType} in (${activityEventTypeValuesSql})`
    ),
    index("work_item_activity_work_item_created_at_idx").on(
      table.workItemId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("work_item_activity_organization_created_at_idx").on(
      table.organizationId,
      table.createdAt.desc(),
      table.id.desc()
    ),
  ]
);

export const workItemVisit = pgTable(
  "work_item_visits",
  {
    id: uuid("id").primaryKey().$defaultFn(generateJobDomainUuid),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id),
    visitDate: date("visit_date").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    note: text("note").notNull(),
    createdAt: jobsTimestamp("created_at"),
  },
  (table) => [
    check(
      "work_item_visits_duration_positive_chk",
      sql`${table.durationMinutes} > 0`
    ),
    check(
      "work_item_visits_duration_hour_increment_chk",
      sql`${table.durationMinutes} % 60 = 0`
    ),
    index("work_item_visits_work_item_visit_date_idx").on(
      table.workItemId,
      table.visitDate.desc(),
      table.id.desc()
    ),
    index("work_item_visits_organization_visit_date_idx").on(
      table.organizationId,
      table.visitDate.desc(),
      table.id.desc()
    ),
  ]
);

export const serviceRegionRelations = relations(
  serviceRegion,
  ({ many, one }) => ({
    organization: one(organization, {
      fields: [serviceRegion.organizationId],
      references: [organization.id],
    }),
    sites: many(site),
  })
);

export const siteRelations = relations(site, ({ many, one }) => ({
  contacts: many(siteContact),
  organization: one(organization, {
    fields: [site.organizationId],
    references: [organization.id],
  }),
  region: one(serviceRegion, {
    fields: [site.regionId],
    references: [serviceRegion.id],
  }),
  workItems: many(workItem),
}));

export const contactRelations = relations(contact, ({ many, one }) => ({
  organization: one(organization, {
    fields: [contact.organizationId],
    references: [organization.id],
  }),
  siteContacts: many(siteContact),
  workItems: many(workItem),
}));

export const siteContactRelations = relations(siteContact, ({ one }) => ({
  site: one(site, {
    fields: [siteContact.siteId],
    references: [site.id],
  }),
  contact: one(contact, {
    fields: [siteContact.contactId],
    references: [contact.id],
  }),
}));

export const workItemRelations = relations(workItem, ({ many, one }) => ({
  activity: many(workItemActivity),
  comments: many(workItemComment),
  contact: one(contact, {
    fields: [workItem.contactId],
    references: [contact.id],
  }),
  site: one(site, {
    fields: [workItem.siteId],
    references: [site.id],
  }),
  visits: many(workItemVisit),
}));

export const workItemCommentRelations = relations(
  workItemComment,
  ({ one }) => ({
    author: one(user, {
      fields: [workItemComment.authorUserId],
      references: [user.id],
    }),
    workItem: one(workItem, {
      fields: [workItemComment.workItemId],
      references: [workItem.id],
    }),
  })
);

export const workItemActivityRelations = relations(
  workItemActivity,
  ({ one }) => ({
    actor: one(user, {
      fields: [workItemActivity.actorUserId],
      references: [user.id],
    }),
    organization: one(organization, {
      fields: [workItemActivity.organizationId],
      references: [organization.id],
    }),
    workItem: one(workItem, {
      fields: [workItemActivity.workItemId],
      references: [workItem.id],
    }),
  })
);

export const workItemVisitRelations = relations(workItemVisit, ({ one }) => ({
  author: one(user, {
    fields: [workItemVisit.authorUserId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [workItemVisit.organizationId],
    references: [organization.id],
  }),
  workItem: one(workItem, {
    fields: [workItemVisit.workItemId],
    references: [workItem.id],
  }),
}));

export const jobsSchema = {
  contact,
  serviceRegion,
  site,
  siteContact,
  workItem,
  workItemActivity,
  workItemComment,
  workItemVisit,
};
