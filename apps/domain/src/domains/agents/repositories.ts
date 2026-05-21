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
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

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
  readonly created_at: Date;
  readonly error_message: string | null;
  readonly id: string;
  readonly input: unknown;
  readonly inserted: boolean;
  readonly operation_id: string;
  readonly result: unknown | null;
  readonly status: string;
}

export const AgentActionInputLedgerValueSchema = Schema.Struct({
  byteLength: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
});
export type AgentActionInputLedgerValue = Schema.Schema.Type<
  typeof AgentActionInputLedgerValueSchema
>;

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
  readonly input: AgentActionInputLedgerValue;
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
  readonly createdAt: string;
  readonly errorMessage: string | null;
  readonly id: AgentActionRunId;
  readonly input: AgentActionInputLedgerValue;
  readonly operationId: AgentActionOperationId;
  readonly result: unknown | null;
  readonly status: AgentActionRunStatusType;
}

export interface BeginAgentActionRunInput {
  readonly actionKind: AgentActionKind;
  readonly actionName: AgentActionName;
  readonly input: AgentActionInputLedgerValue;
  readonly operationId: AgentActionOperationId;
  readonly organizationId: OrganizationId;
  readonly threadId: AgentThreadId;
  readonly userId: UserId;
}

export interface BeginAgentActionRunResult {
  readonly inserted: boolean;
  readonly run: AgentActionRunBeginProjection;
}

export interface CompleteFailedAgentActionRunOptions {
  readonly staleAfterSeconds?: number | undefined;
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
const decodeAgentActionInputLedgerValue = Schema.decodeUnknownSync(
  AgentActionInputLedgerValueSchema
);
const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationIdSchema);
const decodeUserId = Schema.decodeUnknownSync(UserIdSchema);
const decodeTitle = Schema.decodeUnknownSync(
  Schema.Trim.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(120)))
);
const isOrganizationRole = Schema.is(OrganizationRoleSchema);

export class AgentThreadsRepository extends Context.Service<AgentThreadsRepository>()(
  "@ceird/domains/agents/AgentThreadsRepository",
  {
    make: Effect.gen(function* AgentThreadsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const create = Effect.fn("AgentThreadsRepository.create")(function* (
        input: CreateAgentThreadRecordInput
      ) {
        const id = generateAgentThreadId();
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          input.organizationId
        );
        yield* Effect.annotateCurrentSpan("userId", input.userId);
        yield* Effect.annotateCurrentSpan("agent.threadId", id);
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
          yield* Effect.annotateCurrentSpan("organizationId", organizationId);
          yield* Effect.annotateCurrentSpan("userId", userId);
          yield* Effect.annotateCurrentSpan("agent.threadLimit", options.limit);
          const rows = yield* sql<AgentThreadRow>`
            select *
            from agent_threads
            where organization_id = ${organizationId}
              and user_id = ${userId}
              and status = 'active'
            order by updated_at desc, id desc
            limit ${options.limit}
          `;
          yield* Effect.annotateCurrentSpan("agent.threadCount", rows.length);

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
        yield* Effect.annotateCurrentSpan("organizationId", organizationId);
        yield* Effect.annotateCurrentSpan("userId", userId);
        yield* Effect.annotateCurrentSpan("agent.threadId", threadId);
        const rows = yield* sql<AgentThreadRow>`
          select *
          from agent_threads
          where organization_id = ${organizationId}
            and user_id = ${userId}
            and id = ${threadId}
            and status = 'active'
          limit 1
        `;
        yield* Effect.annotateCurrentSpan("agent.threadFound", rows.length > 0);

        return Option.fromNullishOr(rows[0]).pipe(Option.map(mapThreadRow));
      });

      const archive = Effect.fn("AgentThreadsRepository.archive")(function* (
        organizationId: OrganizationId,
        userId: UserId,
        threadId: AgentThreadId
      ) {
        yield* Effect.annotateCurrentSpan("organizationId", organizationId);
        yield* Effect.annotateCurrentSpan("userId", userId);
        yield* Effect.annotateCurrentSpan("agent.threadId", threadId);
        const rows = yield* sql<AgentThreadRow>`
          update agent_threads
          set status = 'archived', updated_at = now()
          where organization_id = ${organizationId}
            and user_id = ${userId}
            and id = ${threadId}
            and status = 'active'
          returning *
        `;
        yield* Effect.annotateCurrentSpan("agent.threadFound", rows.length > 0);

        return Option.fromNullishOr(rows[0]).pipe(Option.map(mapThreadRow));
      });

      const touchActivity = Effect.fn("AgentThreadsRepository.touchActivity")(
        function* (threadId: AgentThreadId) {
          yield* Effect.annotateCurrentSpan("agent.threadId", threadId);
          const rows = yield* sql<AgentThreadRow>`
          update agent_threads
          set last_message_at = now(), updated_at = now()
          where id = ${threadId}
            and status = 'active'
          returning *
        `;
          yield* Effect.annotateCurrentSpan(
            "agent.threadFound",
            rows.length > 0
          );

          return Option.fromNullishOr(rows[0]).pipe(Option.map(mapThreadRow));
        }
      );

      const resolveActiveThreadActor = Effect.fn(
        "AgentThreadsRepository.resolveActiveThreadActor"
      )(function* (threadId: AgentThreadId) {
        yield* Effect.annotateCurrentSpan("agent.threadId", threadId);
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
          yield* Effect.annotateCurrentSpan("agent.threadFound", false);
          return Option.none<AgentThreadActor>();
        }

        const role = normalizeOrganizationActorRole(row.member_role);

        if (role === undefined) {
          yield* Effect.annotateCurrentSpan("agent.threadFound", false);
          return Option.none<AgentThreadActor>();
        }
        yield* Effect.annotateCurrentSpan("agent.threadFound", true);
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          row.organization_id
        );
        yield* Effect.annotateCurrentSpan("userId", row.user_id);
        yield* Effect.annotateCurrentSpan("actorRole", role);

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
) {
  static readonly archive = (
    ...args: Parameters<
      Context.Service.Shape<typeof AgentThreadsRepository>["archive"]
    >
  ) => AgentThreadsRepository.use((service) => service.archive(...args));
  static readonly create = (
    ...args: Parameters<
      Context.Service.Shape<typeof AgentThreadsRepository>["create"]
    >
  ) => AgentThreadsRepository.use((service) => service.create(...args));
  static readonly findActiveForUser = (
    ...args: Parameters<
      Context.Service.Shape<typeof AgentThreadsRepository>["findActiveForUser"]
    >
  ) =>
    AgentThreadsRepository.use((service) => service.findActiveForUser(...args));
  static readonly listForUser = (
    ...args: Parameters<
      Context.Service.Shape<typeof AgentThreadsRepository>["listForUser"]
    >
  ) => AgentThreadsRepository.use((service) => service.listForUser(...args));
  static readonly resolveActiveThreadActor = (
    ...args: Parameters<
      Context.Service.Shape<
        typeof AgentThreadsRepository
      >["resolveActiveThreadActor"]
    >
  ) =>
    AgentThreadsRepository.use((service) =>
      service.resolveActiveThreadActor(...args)
    );
  static readonly touchActivity = (
    ...args: Parameters<
      Context.Service.Shape<typeof AgentThreadsRepository>["touchActivity"]
    >
  ) => AgentThreadsRepository.use((service) => service.touchActivity(...args));
  static readonly DefaultWithoutDependencies = Layer.effect(
    AgentThreadsRepository,
    AgentThreadsRepository.make
  );
  static readonly Default = AgentThreadsRepository.DefaultWithoutDependencies;
}

export class AgentActionRunsRepository extends Context.Service<AgentActionRunsRepository>()(
  "@ceird/domains/agents/AgentActionRunsRepository",
  {
    make: Effect.gen(function* AgentActionRunsRepositoryLive() {
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
        yield* Effect.annotateCurrentSpan("agent.threadId", input.threadId);
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          input.organizationId
        );
        yield* Effect.annotateCurrentSpan("userId", input.userId);
        yield* Effect.annotateCurrentSpan(
          "agent.operationId",
          input.operationId
        );
        yield* Effect.annotateCurrentSpan("agent.actionName", input.actionName);
        yield* Effect.annotateCurrentSpan("agent.actionKind", input.actionKind);
        const insertedRows = yield* sql<AgentActionRunBeginProjectionRow>`
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
          on conflict (thread_id, operation_id) do nothing
          returning
            id,
            operation_id,
            action_name,
            action_kind,
            created_at,
            input,
            status,
            error_message,
            result,
            true as inserted
        `;
        const [insertedRow] = insertedRows;

        if (insertedRow !== undefined) {
          yield* Effect.annotateCurrentSpan("agent.actionRunInserted", true);
          yield* Effect.annotateCurrentSpan(
            "agent.actionRunId",
            insertedRow.id
          );
          yield* Effect.annotateCurrentSpan(
            "agent.actionRunStatus",
            insertedRow.status
          );
          return {
            inserted: true,
            run: mapActionRunBeginProjectionRow(insertedRow),
          } satisfies BeginAgentActionRunResult;
        }

        const replayedRows = yield* sql<AgentActionRunBeginProjectionRow>`
          select
            id,
            operation_id,
            action_name,
            action_kind,
            created_at,
            input,
            status,
            error_message,
            result,
            false as inserted
          from agent_action_runs
          where thread_id = ${input.threadId}
            and operation_id = ${input.operationId}
          limit 1
        `;
        const replayedRow = yield* getRequiredRow(
          replayedRows,
          "agent action run"
        );
        yield* Effect.annotateCurrentSpan("agent.actionRunInserted", false);
        yield* Effect.annotateCurrentSpan("agent.actionRunId", replayedRow.id);
        yield* Effect.annotateCurrentSpan(
          "agent.actionRunStatus",
          replayedRow.status
        );

        return {
          inserted: false,
          run: mapActionRunBeginProjectionRow(replayedRow),
        } satisfies BeginAgentActionRunResult;
      });

      const completeSucceeded = Effect.fn(
        "AgentActionRunsRepository.completeSucceeded"
      )(function* (
        actionRunId: AgentActionRunId,
        result: unknown,
        options: { readonly storeResult: boolean }
      ) {
        yield* Effect.annotateCurrentSpan("agent.actionRunId", actionRunId);
        yield* Effect.annotateCurrentSpan(
          "agent.actionRunStoresResult",
          options.storeResult
        );
        const rows = yield* sql<AgentActionRunRow>`
          update agent_action_runs
          set
            completed_at = now(),
            error_message = null,
            result = ${options.storeResult ? result : null},
            status = 'succeeded',
            updated_at = now()
          where id = ${actionRunId}
            and status = 'running'
          returning *
        `;
        const row = yield* resolveActionRunAfterTerminalRace(actionRunId, rows);
        const run = mapActionRunRow(row);
        yield* Effect.annotateCurrentSpan("agent.actionRunStatus", run.status);

        return run;
      });

      const completeFailed = Effect.fn(
        "AgentActionRunsRepository.completeFailed"
      )(function* (
        actionRunId: AgentActionRunId,
        message: string,
        result: unknown | null = null,
        options: CompleteFailedAgentActionRunOptions = {}
      ) {
        yield* Effect.annotateCurrentSpan("agent.actionRunId", actionRunId);
        const stalePredicate =
          options.staleAfterSeconds === undefined
            ? sql``
            : sql`and created_at <= now() - (${options.staleAfterSeconds} * interval '1 second')`;
        const rows = yield* sql<AgentActionRunRow>`
          update agent_action_runs
          set
            completed_at = now(),
            error_message = ${message},
            result = ${result},
            status = 'failed',
            updated_at = now()
          where id = ${actionRunId}
            and status = 'running'
            ${stalePredicate}
          returning *
        `;
        const row = yield* resolveActionRunAfterTerminalRace(actionRunId, rows);
        const run = mapActionRunRow(row);
        yield* Effect.annotateCurrentSpan("agent.actionRunStatus", run.status);

        return run;
      });

      const resolveActionRunAfterTerminalRace = Effect.fn(
        "AgentActionRunsRepository.resolveActionRunAfterTerminalRace"
      )(function* (
        actionRunId: AgentActionRunId,
        rows: readonly AgentActionRunRow[]
      ) {
        const [updated] = rows;

        if (updated !== undefined) {
          return updated;
        }

        const currentRows = yield* sql<AgentActionRunRow>`
          select *
          from agent_action_runs
          where id = ${actionRunId}
          limit 1
        `;

        return yield* getRequiredRow(currentRows, "agent action run");
      });

      return {
        begin,
        completeFailed,
        completeSucceeded,
        withTransaction,
      };
    }),
  }
) {
  static readonly begin = (
    ...args: Parameters<
      Context.Service.Shape<typeof AgentActionRunsRepository>["begin"]
    >
  ) => AgentActionRunsRepository.use((service) => service.begin(...args));
  static readonly completeFailed = (
    ...args: Parameters<
      Context.Service.Shape<typeof AgentActionRunsRepository>["completeFailed"]
    >
  ) =>
    AgentActionRunsRepository.use((service) => service.completeFailed(...args));
  static readonly completeSucceeded = (
    ...args: Parameters<
      Context.Service.Shape<
        typeof AgentActionRunsRepository
      >["completeSucceeded"]
    >
  ) =>
    AgentActionRunsRepository.use((service) =>
      service.completeSucceeded(...args)
    );
  static readonly withTransaction = <Value, Error, Requirements>(
    effect: Effect.Effect<Value, Error, Requirements>
  ) =>
    AgentActionRunsRepository.use((service) => service.withTransaction(effect));
  static readonly DefaultWithoutDependencies = Layer.effect(
    AgentActionRunsRepository,
    AgentActionRunsRepository.make
  );
  static readonly Default =
    AgentActionRunsRepository.DefaultWithoutDependencies;
}

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
    input: decodeAgentActionInputLedgerValue(row.input),
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
    createdAt: row.created_at.toISOString(),
    errorMessage: row.error_message,
    id: decodeAgentActionRunId(row.id),
    input: decodeAgentActionInputLedgerValue(row.input),
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
