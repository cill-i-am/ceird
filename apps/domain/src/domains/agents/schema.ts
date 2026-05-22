import {
  AGENT_ACTION_KINDS,
  AGENT_ACTION_RUN_STATUSES,
  AGENT_THREAD_STATUSES,
} from "@ceird/agents-core";
import type {
  AgentActionKind,
  AgentActionName,
  AgentActionOperationId,
  AgentActionRunId,
  AgentActionRunStatus,
  AgentInstanceName,
  AgentThreadId,
  AgentThreadStatus,
} from "@ceird/agents-core";
import type { OrganizationId, UserId } from "@ceird/identity-core";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization, user } from "../identity/authentication/schema.js";
import {
  generateAgentActionRunId,
  generateAgentThreadId,
} from "./id-generation.js";

const agentTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

const agentThreadStatusValuesSql = sql.raw(
  AGENT_THREAD_STATUSES.map((value) => `'${value}'`).join(", ")
);
const agentActionRunStatusValuesSql = sql.raw(
  AGENT_ACTION_RUN_STATUSES.map((value) => `'${value}'`).join(", ")
);
const agentActionKindValuesSql = sql.raw(
  AGENT_ACTION_KINDS.map((value) => `'${value}'`).join(", ")
);

export const agentThread = pgTable(
  "agent_threads",
  {
    id: uuid("id")
      .$type<AgentThreadId>()
      .primaryKey()
      .$defaultFn(generateAgentThreadId),
    organizationId: text("organization_id")
      .$type<OrganizationId>()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    agentInstanceName: text("agent_instance_name")
      .$type<AgentInstanceName>()
      .notNull(),
    title: text("title").notNull(),
    status: text("status")
      .$type<AgentThreadStatus>()
      .notNull()
      .default("active"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: agentTimestamp("created_at"),
    updatedAt: agentTimestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("agent_threads_agent_instance_name_idx").on(
      table.agentInstanceName
    ),
    uniqueIndex("agent_threads_id_org_user_idx").on(
      table.id,
      table.organizationId,
      table.userId
    ),
    index("agent_threads_org_user_status_updated_idx").on(
      table.organizationId,
      table.userId,
      table.status,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    check(
      "agent_threads_status_chk",
      sql`${table.status} in (${agentThreadStatusValuesSql})`
    ),
    check(
      "agent_threads_title_not_empty_chk",
      sql`length(trim(${table.title})) > 0`
    ),
    check(
      "agent_threads_title_max_length_chk",
      sql`length(trim(${table.title})) <= 120`
    ),
  ]
);

export const agentActionRun = pgTable(
  "agent_action_runs",
  {
    id: uuid("id")
      .$type<AgentActionRunId>()
      .primaryKey()
      .$defaultFn(generateAgentActionRunId),
    threadId: uuid("thread_id").$type<AgentThreadId>().notNull(),
    organizationId: text("organization_id").$type<OrganizationId>().notNull(),
    userId: text("user_id").$type<UserId>().notNull(),
    operationId: text("operation_id").$type<AgentActionOperationId>().notNull(),
    actionName: text("action_name").$type<AgentActionName>().notNull(),
    actionKind: text("action_kind").$type<AgentActionKind>().notNull(),
    status: text("status")
      .$type<AgentActionRunStatus>()
      .notNull()
      .default("running"),
    input: jsonb("input").notNull(),
    result: jsonb("result"),
    errorMessage: text("error_message"),
    createdAt: agentTimestamp("created_at"),
    updatedAt: agentTimestamp("updated_at"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.threadId, table.organizationId, table.userId],
      foreignColumns: [
        agentThread.id,
        agentThread.organizationId,
        agentThread.userId,
      ],
      name: "agent_action_runs_thread_actor_fk",
    }).onDelete("cascade"),
    uniqueIndex("agent_action_runs_thread_operation_idx").on(
      table.threadId,
      table.operationId
    ),
    index("agent_action_runs_org_user_thread_created_idx").on(
      table.organizationId,
      table.userId,
      table.threadId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    check(
      "agent_action_runs_status_chk",
      sql`${table.status} in (${agentActionRunStatusValuesSql})`
    ),
    check(
      "agent_action_runs_kind_chk",
      sql`${table.actionKind} in (${agentActionKindValuesSql})`
    ),
    check(
      "agent_action_runs_operation_id_not_empty_chk",
      sql`length(trim(${table.operationId})) > 0`
    ),
    check(
      "agent_action_runs_action_name_not_empty_chk",
      sql`length(trim(${table.actionName})) > 0`
    ),
    check(
      "agent_action_runs_completed_status_chk",
      sql`(${table.status} = 'running' and ${table.completedAt} is null) or (${table.status} <> 'running' and ${table.completedAt} is not null)`
    ),
  ]
);

export const agentsSchema = {
  agentActionRun,
  agentThread,
};
