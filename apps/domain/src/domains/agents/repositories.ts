/* oxlint-disable eslint/max-classes-per-file */

import {
  AgentActionKindSchema,
  AgentActionNameSchema,
  AgentActionOperationId as AgentActionOperationIdSchema,
  AgentActionRunId as AgentActionRunIdSchema,
  AgentActionRunStatus,
  AgentInstanceName,
  AgentThreadId as AgentThreadIdSchema,
  AgentThreadSchema,
  AgentThreadStatus,
  buildAgentInstanceName,
} from "@ceird/agents-core";
import type {
  AgentActionKind,
  AgentActionName,
  AgentActionOperationId,
  AgentActionRunId,
  AgentActionRunStatus as AgentActionRunStatusType,
  AgentThread,
  AgentThreadId,
} from "@ceird/agents-core";
import {
  isExternalOrganizationRole,
  isInternalOrganizationRole,
  OrganizationId as OrganizationIdSchema,
  OrganizationRole as OrganizationRoleSchema,
  UserId as UserIdSchema,
} from "@ceird/identity-core";
import type { OrganizationId, UserId } from "@ceird/identity-core";
import { SqlClient } from "@effect/sql";
import { Effect, Option, Schema } from "effect";

import type { OrganizationActor } from "../organizations/current-actor.js";
import {
  generateAgentActionRunId,
  generateAgentThreadId,
} from "./id-generation.js";

const DEFAULT_THREAD_TITLE = "New thread";

interface AgentThreadRow {
  readonly agent_instance_name: string;
  readonly created_at: Date;
  readonly id: string;
  readonly last_message_at: Date | null;
  readonly organization_id: string;
  readonly status: string;
  readonly title: string;
  readonly updated_at: Date;
  readonly user_id: string;
}

interface AgentThreadActorRow extends AgentThreadRow {
  readonly member_role: string;
}

interface AgentActionRunRow {
  readonly action_kind: string;
  readonly action_name: string;
  readonly completed_at: Date | null;
  readonly created_at: Date;
  readonly error_message: string | null;
  readonly id: string;
  readonly input: unknown;
  readonly operation_id: string;
  readonly organization_id: string;
  readonly result: unknown | null;
  readonly status: string;
  readonly thread_id: string;
  readonly updated_at: Date;
  readonly user_id: string;
}

interface AgentActionRunBeginProjectionRow {
  readonly action_kind: string;
  readonly action_name: string;
  readonly error_message: string | null;
  readonly id: string;
  readonly input: unknown;
  readonly inserted: boolean;
  readonly operation_id: string;
  readonly result: unknown | null;
  readonly status: string;
}

export interface CreateAgentThreadRecordInput {
  readonly organizationId: OrganizationId;
  readonly title?: string | undefined;
  readonly userId: UserId;
}

export interface AgentThreadActor {
  readonly actor: OrganizationActor;
  readonly thread: AgentThread;
}

export interface AgentActionRun {
  readonly actionKind: AgentActionKind;
  readonly actionName: AgentActionName;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly errorMessage: string | null;
  readonly id: AgentActionRunId;
  readonly input: unknown;
  readonly operationId: AgentActionOperationId;
  readonly organizationId: OrganizationId;
  readonly result: unknown | null;
  readonly status: AgentActionRunStatusType;
  readonly threadId: AgentThreadId;
  readonly updatedAt: string;
  readonly userId: UserId;
}

export interface AgentActionRunBeginProjection {
  readonly actionKind: AgentActionKind;
  readonly actionName: AgentActionName;
  readonly errorMessage: string | null;
  readonly id: AgentActionRunId;
  readonly input: unknown;
  readonly operationId: AgentActionOperationId;
  readonly result: unknown | null;
  readonly status: AgentActionRunStatusType;
}

export interface BeginAgentActionRunInput {
  readonly actionKind: AgentActionKind;
  readonly actionName: AgentActionName;
  readonly input: unknown;
  readonly operationId: AgentActionOperationId;
  readonly organizationId: OrganizationId;
  readonly threadId: AgentThreadId;
  readonly userId: UserId;
}

export interface BeginAgentActionRunResult {
  readonly inserted: boolean;
  readonly run: AgentActionRunBeginProjection;
}

const decodeAgentThread = Schema.decodeUnknownSync(AgentThreadSchema);
const decodeAgentThreadId = Schema.decodeUnknownSync(AgentThreadIdSchema);
const decodeAgentActionRunId = Schema.decodeUnknownSync(AgentActionRunIdSchema);
const decodeAgentActionOperationId = Schema.decodeUnknownSync(
  AgentActionOperationIdSchema
);
const decodeAgentThreadStatus = Schema.decodeUnknownSync(AgentThreadStatus);
const decodeAgentActionRunStatus =
  Schema.decodeUnknownSync(AgentActionRunStatus);
const decodeAgentInstanceName = Schema.decodeUnknownSync(AgentInstanceName);
const decodeAgentActionName = Schema.decodeUnknownSync(AgentActionNameSchema);
const decodeAgentActionKind = Schema.decodeUnknownSync(AgentActionKindSchema);
const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationIdSchema);
const decodeUserId = Schema.decodeUnknownSync(UserIdSchema);
const decodeTitle = Schema.decodeUnknownSync(
  Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(120))
);
const isOrganizationRole = Schema.is(OrganizationRoleSchema);

export class AgentThreadsRepository extends Effect.Service<AgentThreadsRepository>()(
  "@ceird/domains/agents/AgentThreadsRepository",
  {
    accessors: true,
    effect: Effect.gen(function* AgentThreadsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const create = Effect.fn("AgentThreadsRepository.create")(function* (
        input: CreateAgentThreadRecordInput
      ) {
        const id = generateAgentThreadId();
        const title = decodeTitle(input.title ?? DEFAULT_THREAD_TITLE);
        const agentInstanceName = buildAgentInstanceName({
          organizationId: input.organizationId,
          threadId: id,
          userId: input.userId,
        });
        const rows = yield* sql<AgentThreadRow>`
          insert into agent_threads ${sql
            .insert({
              agent_instance_name: agentInstanceName,
              id,
              organization_id: input.organizationId,
              title,
              user_id: input.userId,
            })
            .returning("*")}
        `;

        return mapThreadRow(
          yield* getRequiredRow(rows, "inserted agent thread")
        );
      });

      const listForUser = Effect.fn("AgentThreadsRepository.listForUser")(
        function* (
          organizationId: OrganizationId,
          userId: UserId,
          options: { readonly limit: number }
        ) {
          const rows = yield* sql<AgentThreadRow>`
            select *
            from agent_threads
            where organization_id = ${organizationId}
              and user_id = ${userId}
              and status = 'active'
            order by updated_at desc, id desc
            limit ${options.limit}
          `;

          return rows.map(mapThreadRow);
        }
      );

      const findActiveForUser = Effect.fn(
        "AgentThreadsRepository.findActiveForUser"
      )(function* (
        organizationId: OrganizationId,
        userId: UserId,
        threadId: AgentThreadId
      ) {
        const rows = yield* sql<AgentThreadRow>`
          select *
          from agent_threads
          where organization_id = ${organizationId}
            and user_id = ${userId}
            and id = ${threadId}
            and status = 'active'
          limit 1
        `;

        return Option.fromNullable(rows[0]).pipe(Option.map(mapThreadRow));
      });

      const archive = Effect.fn("AgentThreadsRepository.archive")(function* (
        organizationId: OrganizationId,
        userId: UserId,
        threadId: AgentThreadId
      ) {
        const rows = yield* sql<AgentThreadRow>`
          update agent_threads
          set status = 'archived', updated_at = now()
          where organization_id = ${organizationId}
            and user_id = ${userId}
            and id = ${threadId}
            and status = 'active'
          returning *
        `;

        return Option.fromNullable(rows[0]).pipe(Option.map(mapThreadRow));
      });

      const touchActivity = Effect.fn("AgentThreadsRepository.touchActivity")(
        function* (threadId: AgentThreadId) {
          const rows = yield* sql<AgentThreadRow>`
          update agent_threads
          set last_message_at = now(), updated_at = now()
          where id = ${threadId}
            and status = 'active'
          returning *
        `;

          return Option.fromNullable(rows[0]).pipe(Option.map(mapThreadRow));
        }
      );

      const resolveActiveThreadActor = Effect.fn(
        "AgentThreadsRepository.resolveActiveThreadActor"
      )(function* (threadId: AgentThreadId) {
        const rows = yield* sql<AgentThreadActorRow>`
          select
            agent_threads.*,
            member.role as member_role
          from agent_threads
          join member
            on member.organization_id = agent_threads.organization_id
           and member.user_id = agent_threads.user_id
          where agent_threads.id = ${threadId}
            and agent_threads.status = 'active'
          limit 1
        `;
        const [row] = rows;

        if (row === undefined) {
          return Option.none<AgentThreadActor>();
        }

        const role = normalizeOrganizationActorRole(row.member_role);

        if (role === undefined) {
          return Option.none<AgentThreadActor>();
        }

        return Option.some({
          actor: {
            organizationId: decodeOrganizationId(row.organization_id),
            role,
            userId: decodeUserId(row.user_id),
          },
          thread: mapThreadRow(row),
        });
      });

      return {
        archive,
        create,
        findActiveForUser,
        listForUser,
        resolveActiveThreadActor,
        touchActivity,
      };
    }),
  }
) {}

export class AgentActionRunsRepository extends Effect.Service<AgentActionRunsRepository>()(
  "@ceird/domains/agents/AgentActionRunsRepository",
  {
    accessors: true,
    effect: Effect.gen(function* AgentActionRunsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const withTransaction = Effect.fn(
        "AgentActionRunsRepository.withTransaction"
      )(
        <Value, Error, Requirements>(
          effect: Effect.Effect<Value, Error, Requirements>
        ) => sql.withTransaction(effect)
      );

      const begin = Effect.fn("AgentActionRunsRepository.begin")(function* (
        input: BeginAgentActionRunInput
      ) {
        const rows = yield* sql<AgentActionRunBeginProjectionRow>`
          insert into agent_action_runs (
            id,
            thread_id,
            organization_id,
            user_id,
            operation_id,
            action_name,
            action_kind,
            status,
            input
          )
          values (
            ${generateAgentActionRunId()},
            ${input.threadId},
            ${input.organizationId},
            ${input.userId},
            ${input.operationId},
            ${input.actionName},
            ${input.actionKind},
            'running',
            ${input.input}
          )
          on conflict (thread_id, operation_id) do update
          set operation_id = excluded.operation_id
          returning
            id,
            operation_id,
            action_name,
            action_kind,
            input,
            status,
            error_message,
            result,
            (xmax = 0) as inserted
        `;

        const row = yield* getRequiredRow(rows, "agent action run");

        return {
          inserted: row.inserted,
          run: mapActionRunBeginProjectionRow(row),
        } satisfies BeginAgentActionRunResult;
      });

      const completeSucceeded = Effect.fn(
        "AgentActionRunsRepository.completeSucceeded"
      )(function* (
        actionRunId: AgentActionRunId,
        result: unknown,
        options: { readonly storeResult: boolean }
      ) {
        const rows = yield* sql<AgentActionRunRow>`
          update agent_action_runs
          set
            completed_at = now(),
            error_message = null,
            result = ${options.storeResult ? result : null},
            status = 'succeeded',
            updated_at = now()
          where id = ${actionRunId}
          returning *
        `;

        return mapActionRunRow(
          yield* getRequiredRow(rows, "completed agent action run")
        );
      });

      const completeFailed = Effect.fn(
        "AgentActionRunsRepository.completeFailed"
      )(function* (actionRunId: AgentActionRunId, message: string) {
        const rows = yield* sql<AgentActionRunRow>`
          update agent_action_runs
          set
            completed_at = now(),
            error_message = ${message},
            status = 'failed',
            updated_at = now()
          where id = ${actionRunId}
          returning *
        `;

        return mapActionRunRow(
          yield* getRequiredRow(rows, "failed agent action run")
        );
      });

      return {
        begin,
        completeFailed,
        completeSucceeded,
        withTransaction,
      };
    }),
  }
) {}

export function mapThreadRow(row: AgentThreadRow): AgentThread {
  return decodeAgentThread({
    agentInstanceName: decodeAgentInstanceName(row.agent_instance_name),
    createdAt: row.created_at.toISOString(),
    id: decodeAgentThreadId(row.id),
    lastMessageAt:
      row.last_message_at === null ? null : row.last_message_at.toISOString(),
    status: decodeAgentThreadStatus(row.status),
    title: row.title,
    updatedAt: row.updated_at.toISOString(),
  });
}

function mapActionRunRow(row: AgentActionRunRow): AgentActionRun {
  return {
    actionKind: decodeAgentActionKind(row.action_kind),
    actionName: decodeAgentActionName(row.action_name),
    completedAt:
      row.completed_at === null ? null : row.completed_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    errorMessage: row.error_message,
    id: decodeAgentActionRunId(row.id),
    input: row.input,
    operationId: decodeAgentActionOperationId(row.operation_id),
    organizationId: decodeOrganizationId(row.organization_id),
    result: row.result,
    status: decodeAgentActionRunStatus(row.status),
    threadId: decodeAgentThreadId(row.thread_id),
    updatedAt: row.updated_at.toISOString(),
    userId: decodeUserId(row.user_id),
  };
}

function mapActionRunBeginProjectionRow(
  row: AgentActionRunBeginProjectionRow
): AgentActionRunBeginProjection {
  return {
    actionKind: decodeAgentActionKind(row.action_kind),
    actionName: decodeAgentActionName(row.action_name),
    errorMessage: row.error_message,
    id: decodeAgentActionRunId(row.id),
    input: row.input,
    operationId: decodeAgentActionOperationId(row.operation_id),
    result: row.result,
    status: decodeAgentActionRunStatus(row.status),
  };
}

function normalizeOrganizationActorRole(
  membershipRole: string
): OrganizationActor["role"] | undefined {
  if (!isOrganizationRole(membershipRole)) {
    return undefined;
  }

  return isInternalOrganizationRole(membershipRole) ||
    isExternalOrganizationRole(membershipRole)
    ? membershipRole
    : undefined;
}

function getRequiredRow<Value>(
  rows: readonly Value[],
  label: string
): Effect.Effect<Value> {
  const [row] = rows;

  if (row === undefined) {
    return Effect.die(new Error(`Expected ${label} row to be returned`));
  }

  return Effect.succeed(row);
}
