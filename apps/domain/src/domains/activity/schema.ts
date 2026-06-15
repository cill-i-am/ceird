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
} from "drizzle-orm/pg-core";

import { agentThread } from "../agents/schema.js";
import { organization, user } from "../identity/authentication/schema.js";
import { generateProductActorId } from "./id-generation.js";

const activityTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

const productActorKindValuesSql = sql.raw(
  PRODUCT_ACTOR_KINDS.map((value) => `'${value}'`).join(", ")
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

export const activitySchema = {
  productActivityActor,
  productActivityActorSource,
};
