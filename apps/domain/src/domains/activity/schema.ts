import {
  ACTIVITY_EVENT_SOURCE_TYPES,
  ACTIVITY_EVENT_STATUSES,
  ACTIVITY_EVENT_TARGET_TYPES,
  ACTIVITY_EVENT_TYPES,
} from "@ceird/activity-core";
import type {
  ActivityEventId,
  ActivityEventSourceType,
  ActivityEventStatus,
  ActivityEventTargetType,
  ActivityEventType,
  ProductActivityEventDisplayPayload,
} from "@ceird/activity-core";
import { PRODUCT_ACTOR_KINDS } from "@ceird/identity-core";
import type {
  OrganizationId,
  ProductActorId,
  ProductActorKind,
} from "@ceird/identity-core";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";

import { agentThread } from "../agents/schema.js";
import { organization, user } from "../identity/authentication/schema.js";
import {
  generateActivityEventId,
  generateProductActorId,
} from "./id-generation.js";

const activityTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

const productActorKindValuesSql = sql.raw(
  PRODUCT_ACTOR_KINDS.map((value) => `'${value}'`).join(", ")
);
const activityEventTypeValuesSql = sql.raw(
  ACTIVITY_EVENT_TYPES.map((value) => `'${value}'`).join(", ")
);
const activityEventTargetTypeValuesSql = sql.raw(
  ACTIVITY_EVENT_TARGET_TYPES.map((value) => `'${value}'`).join(", ")
);
const activityEventSourceTypeValuesSql = sql.raw(
  ACTIVITY_EVENT_SOURCE_TYPES.map((value) => `'${value}'`).join(", ")
);
const activityEventStatusValuesSql = sql.raw(
  ACTIVITY_EVENT_STATUSES.map((value) => `'${value}'`).join(", ")
);

export const productActivityActor = pgTable(
  "product_activity_actors",
  {
    id: uuid("id")
      .$type<ProductActorId>()
      .primaryKey()
      .$defaultFn(generateProductActorId),
    organizationId: text("organization_id")
      .$type<OrganizationId>()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ProductActorKind>().notNull(),
    displayName: text("display_name").notNull(),
    displayDetail: text("display_detail"),
    routeHref: text("route_href"),
    routeLabel: text("route_label"),
    createdAt: activityTimestamp("created_at"),
    updatedAt: activityTimestamp("updated_at"),
  },
  (table) => [
    check(
      "product_activity_actors_kind_chk",
      sql`${table.kind} in (${productActorKindValuesSql})`
    ),
    check(
      "product_activity_actors_display_name_not_empty_chk",
      sql`length(trim(${table.displayName})) > 0`
    ),
    check(
      "product_activity_actors_route_consistent_chk",
      sql`(${table.routeHref} is null and ${table.routeLabel} is null) or (${table.routeHref} is not null and ${table.routeLabel} is not null)`
    ),
    uniqueIndex("product_activity_actors_id_org_idx").on(
      table.id,
      table.organizationId
    ),
    index("product_activity_actors_org_kind_updated_idx").on(
      table.organizationId,
      table.kind,
      table.updatedAt.desc(),
      table.id.desc()
    ),
  ]
);

export const productActivityActorSource = pgTable(
  "product_activity_actor_sources",
  {
    actorId: uuid("actor_id").$type<ProductActorId>().primaryKey(),
    organizationId: text("organization_id")
      .$type<OrganizationId>()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ProductActorKind>().notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    agentThreadId: uuid("agent_thread_id"),
    systemKey: text("system_key"),
    createdAt: activityTimestamp("created_at"),
    updatedAt: activityTimestamp("updated_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.actorId, table.organizationId],
      foreignColumns: [
        productActivityActor.id,
        productActivityActor.organizationId,
      ],
      name: "product_activity_actor_sources_actor_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.agentThreadId, table.organizationId, table.userId],
      foreignColumns: [
        agentThread.id,
        agentThread.organizationId,
        agentThread.userId,
      ],
      name: "product_activity_actor_sources_agent_thread_fk",
    }).onDelete("cascade"),
    check(
      "product_activity_actor_sources_kind_chk",
      sql`${table.kind} in (${productActorKindValuesSql})`
    ),
    check(
      "product_activity_actor_sources_one_source_chk",
      sql`(
        ${table.kind} = 'member'
        and ${table.userId} is not null
        and ${table.agentThreadId} is null
        and ${table.systemKey} is null
      ) or (
        ${table.kind} = 'agent'
        and ${table.userId} is not null
        and ${table.agentThreadId} is not null
        and ${table.systemKey} is null
      ) or (
        ${table.kind} = 'system'
        and ${table.userId} is null
        and ${table.agentThreadId} is null
        and ${table.systemKey} is not null
      )`
    ),
    uniqueIndex("product_activity_actor_sources_member_idx")
      .on(table.organizationId, table.userId)
      .where(sql`${table.kind} = 'member'`),
    uniqueIndex("product_activity_actor_sources_agent_thread_idx")
      .on(table.organizationId, table.agentThreadId)
      .where(sql`${table.kind} = 'agent'`),
    uniqueIndex("product_activity_actor_sources_system_idx")
      .on(table.organizationId, table.systemKey)
      .where(sql`${table.kind} = 'system'`),
  ]
);

export const activityEvent = pgTable(
  "activity_events",
  {
    id: uuid("id")
      .$type<ActivityEventId>()
      .primaryKey()
      .$defaultFn(generateActivityEventId),
    organizationId: text("organization_id")
      .$type<OrganizationId>()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    eventType: text("event_type").$type<ActivityEventType>().notNull(),
    targetType: text("target_type").$type<ActivityEventTargetType>().notNull(),
    targetId: text("target_id").notNull(),
    actorId: uuid("actor_id").$type<ProductActorId>().notNull(),
    sourceType: text("source_type").$type<ActivityEventSourceType>().notNull(),
    sourceId: text("source_id").notNull(),
    display: jsonb("display")
      .$type<ProductActivityEventDisplayPayload>()
      .notNull(),
    status: text("status").$type<ActivityEventStatus>().notNull(),
    createdAt: activityTimestamp("created_at"),
    retainedUntil: timestamp("retained_until", {
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.actorId, table.organizationId],
      foreignColumns: [
        productActivityActor.id,
        productActivityActor.organizationId,
      ],
      name: "activity_events_actor_org_fk",
    }),
    check(
      "activity_events_event_type_chk",
      sql`${table.eventType} in (${activityEventTypeValuesSql})`
    ),
    check(
      "activity_events_target_type_chk",
      sql`${table.targetType} in (${activityEventTargetTypeValuesSql})`
    ),
    check(
      "activity_events_source_type_chk",
      sql`${table.sourceType} in (${activityEventSourceTypeValuesSql})`
    ),
    check(
      "activity_events_status_chk",
      sql`${table.status} in (${activityEventStatusValuesSql})`
    ),
    check(
      "activity_events_retained_until_after_created_chk",
      sql`${table.retainedUntil} > ${table.createdAt}`
    ),
    uniqueIndex("activity_events_id_org_idx").on(
      table.id,
      table.organizationId
    ),
    uniqueIndex("activity_events_org_source_idx").on(
      table.organizationId,
      table.sourceType,
      table.sourceId
    ),
    index("activity_events_org_created_idx").on(
      table.organizationId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("activity_events_org_retained_until_idx").on(
      table.organizationId,
      table.retainedUntil
    ),
    index("activity_events_org_target_created_idx").on(
      table.organizationId,
      table.targetType,
      table.targetId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("activity_events_org_event_created_idx").on(
      table.organizationId,
      table.eventType,
      table.createdAt.desc(),
      table.id.desc()
    ),
  ]
);

export const activitySchema = {
  activityEvent,
  productActivityActor,
  productActivityActorSource,
};
