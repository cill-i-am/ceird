import type { JobActivityPayload } from "@task-tracker/jobs-core";
import {
  JOB_ACTIVITY_EVENT_TYPES,
  JOB_COST_LINE_TYPES,
  JOB_KINDS,
  JOB_PRIORITIES,
  JOB_STATUSES,
  MAX_JOB_COST_LINE_TAX_RATE_BASIS_POINTS,
  RATE_CARD_LINE_KINDS,
} from "@task-tracker/jobs-core";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
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
const jobLabelNameMaxLength = 48;
const rateCardLineKindValuesSql = sql.raw(
  RATE_CARD_LINE_KINDS.map((value) => `'${value}'`).join(", ")
);
const costLineTypeValuesSql = sql.raw(
  JOB_COST_LINE_TYPES.map((value) => `'${value}'`).join(", ")
);
const maxJobCostLineTaxRateBasisPointsSql = sql.raw(
  String(MAX_JOB_COST_LINE_TAX_RATE_BASIS_POINTS)
);

export const serviceArea = pgTable(
  "service_areas",
  {
    id: uuid("id").primaryKey().$defaultFn(generateJobDomainUuid),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    slug: text("slug").notNull(),
    createdAt: jobsTimestamp("created_at"),
    updatedAt: jobsTimestamp("updated_at"),
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

export const rateCard = pgTable(
  "rate_cards",
  {
    id: uuid("id").primaryKey().$defaultFn(generateJobDomainUuid),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: jobsTimestamp("created_at"),
    updatedAt: jobsTimestamp("updated_at"),
    archivedAt: archivedAtColumn("archived_at"),
  },
  (table) => [
    index("rate_cards_organization_updated_at_idx").on(
      table.organizationId,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    uniqueIndex("rate_cards_organization_name_idx").on(
      table.organizationId,
      table.name
    ),
  ]
);

export const rateCardLine = pgTable(
  "rate_card_lines",
  {
    id: uuid("id").primaryKey().$defaultFn(generateJobDomainUuid),
    rateCardId: uuid("rate_card_id")
      .notNull()
      .references(() => rateCard.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    unit: text("unit").notNull(),
    value: numeric("value", { precision: 12, scale: 2 }).notNull(),
  },
  (table) => [
    uniqueIndex("rate_card_lines_rate_card_position_unique_idx").on(
      table.rateCardId,
      table.position
    ),
    check("rate_card_lines_value_non_negative_chk", sql`${table.value} >= 0`),
    check("rate_card_lines_position_positive_chk", sql`${table.position} > 0`),
    check(
      "rate_card_lines_kind_chk",
      sql`${table.kind} in (${rateCardLineKindValuesSql})`
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
    index("sites_organization_service_area_idx").on(
      table.organizationId,
      table.serviceAreaId
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

export const jobLabel = pgTable(
  "job_labels",
  {
    id: uuid("id").primaryKey().$defaultFn(generateJobDomainUuid),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: jobsTimestamp("created_at"),
    updatedAt: jobsTimestamp("updated_at"),
    archivedAt: archivedAtColumn("archived_at"),
  },
  (table) => [
    uniqueIndex("job_labels_organization_normalized_active_idx")
      .on(table.organizationId, table.normalizedName)
      .where(sql`${table.archivedAt} is null`),
    uniqueIndex("job_labels_id_organization_idx").on(
      table.id,
      table.organizationId
    ),
    index("job_labels_organization_name_idx")
      .on(table.organizationId, table.name, table.id)
      .where(sql`${table.archivedAt} is null`),
    check(
      "job_labels_name_not_empty_chk",
      sql`length(trim(${table.name})) > 0`
    ),
    check(
      "job_labels_name_max_length_chk",
      sql`length(trim(${table.name})) <= ${sql.raw(String(jobLabelNameMaxLength))}`
    ),
    check(
      "job_labels_normalized_name_not_empty_chk",
      sql`length(trim(${table.normalizedName})) > 0`
    ),
    check(
      "job_labels_normalized_name_max_length_chk",
      sql`length(trim(${table.normalizedName})) <= ${sql.raw(String(jobLabelNameMaxLength))}`
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
    uniqueIndex("work_items_id_organization_idx").on(
      table.id,
      table.organizationId
    ),
    index("work_items_organization_active_updated_at_idx")
      .on(table.organizationId, table.updatedAt.desc(), table.id.desc())
      .where(sql`${table.status} not in ('completed', 'canceled')`),
    index("work_items_title_trgm_idx").using(
      "gin",
      table.title.op("gin_trgm_ops")
    ),
    uniqueIndex("work_items_id_organization_id_idx").on(
      table.id,
      table.organizationId
    ),
  ]
);

export const workItemLabel = pgTable(
  "work_item_labels",
  {
    workItemId: uuid("work_item_id").notNull(),
    labelId: uuid("label_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: jobsTimestamp("created_at"),
  },
  (table) => [
    primaryKey({ columns: [table.workItemId, table.labelId] }),
    foreignKey({
      columns: [table.workItemId, table.organizationId],
      foreignColumns: [workItem.id, workItem.organizationId],
      name: "work_item_labels_work_item_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.labelId, table.organizationId],
      foreignColumns: [jobLabel.id, jobLabel.organizationId],
      name: "work_item_labels_label_org_fk",
    }).onDelete("cascade"),
    index("work_item_labels_label_work_item_idx").on(
      table.organizationId,
      table.labelId,
      table.workItemId
    ),
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
    index("work_item_activity_organization_actor_created_at_idx").on(
      table.organizationId,
      table.actorUserId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("work_item_activity_organization_event_created_at_idx").on(
      table.organizationId,
      table.eventType,
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

export const serviceAreaRelations = relations(serviceArea, ({ many, one }) => ({
  organization: one(organization, {
    fields: [serviceArea.organizationId],
    references: [organization.id],
  }),
  sites: many(site),
}));

export const rateCardRelations = relations(rateCard, ({ many, one }) => ({
  lines: many(rateCardLine),
  organization: one(organization, {
    fields: [rateCard.organizationId],
    references: [organization.id],
  }),
}));

export const rateCardLineRelations = relations(rateCardLine, ({ one }) => ({
  rateCard: one(rateCard, {
    fields: [rateCardLine.rateCardId],
    references: [rateCard.id],
  }),
}));

export const workItemCostLine = pgTable(
  "work_item_cost_lines",
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
    type: text("type").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points"),
    createdAt: jobsTimestamp("created_at"),
  },
  (table) => [
    check(
      "work_item_cost_lines_type_chk",
      sql`${table.type} in (${costLineTypeValuesSql})`
    ),
    check(
      "work_item_cost_lines_quantity_positive_chk",
      sql`${table.quantity} > 0`
    ),
    check(
      "work_item_cost_lines_unit_price_non_negative_chk",
      sql`${table.unitPriceMinor} >= 0`
    ),
    check(
      "work_item_cost_lines_tax_rate_range_chk",
      sql`${table.taxRateBasisPoints} is null or (${table.taxRateBasisPoints} >= 0 and ${table.taxRateBasisPoints} <= ${maxJobCostLineTaxRateBasisPointsSql})`
    ),
    foreignKey({
      columns: [table.workItemId, table.organizationId],
      foreignColumns: [workItem.id, workItem.organizationId],
      name: "work_item_cost_lines_work_item_organization_fk",
    }).onDelete("cascade"),
    index("work_item_cost_lines_work_item_created_at_idx").on(
      table.workItemId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("work_item_cost_lines_organization_created_at_idx").on(
      table.organizationId,
      table.createdAt.desc(),
      table.id.desc()
    ),
  ]
);

export const siteRelations = relations(site, ({ many, one }) => ({
  contacts: many(siteContact),
  organization: one(organization, {
    fields: [site.organizationId],
    references: [organization.id],
  }),
  serviceArea: one(serviceArea, {
    fields: [site.serviceAreaId],
    references: [serviceArea.id],
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

export const jobLabelRelations = relations(jobLabel, ({ many, one }) => ({
  organization: one(organization, {
    fields: [jobLabel.organizationId],
    references: [organization.id],
  }),
  workItems: many(workItemLabel),
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
  costLines: many(workItemCostLine),
  site: one(site, {
    fields: [workItem.siteId],
    references: [site.id],
  }),
  labels: many(workItemLabel),
  visits: many(workItemVisit),
}));

export const workItemLabelRelations = relations(workItemLabel, ({ one }) => ({
  label: one(jobLabel, {
    fields: [workItemLabel.labelId],
    references: [jobLabel.id],
  }),
  workItem: one(workItem, {
    fields: [workItemLabel.workItemId],
    references: [workItem.id],
  }),
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

export const workItemCostLineRelations = relations(
  workItemCostLine,
  ({ one }) => ({
    author: one(user, {
      fields: [workItemCostLine.authorUserId],
      references: [user.id],
    }),
    organization: one(organization, {
      fields: [workItemCostLine.organizationId],
      references: [organization.id],
    }),
    workItem: one(workItem, {
      fields: [workItemCostLine.workItemId],
      references: [workItem.id],
    }),
  })
);

export const jobsSchema = {
  contact,
  jobLabel,
  rateCard,
  rateCardLine,
  serviceArea,
  site,
  siteContact,
  workItem,
  workItemActivity,
  workItemCostLine,
  workItemComment,
  workItemLabel,
  workItemVisit,
};
