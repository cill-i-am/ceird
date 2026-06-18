/* eslint-disable max-classes-per-file -- Activity actor and event repositories share the same domain projection boundary. */

import {
  ACTIVITY_FEED_MAX_EVENTS_PER_ORG,
  ACTIVITY_FEED_RETENTION_DAYS,
  ProductActivityEventDisplayPayloadSchema,
  ProductActivityEventSchema,
} from "@ceird/activity-core";
import type {
  ActivityEventId,
  ActivityEventSourceType,
  ActivityEventStatus,
  ActivityEventTargetType,
  ActivityEventType,
  ProductActivityEvent,
  ProductActivityEventDisplayPayload,
} from "@ceird/activity-core";
import type { AgentThreadId } from "@ceird/agents-core";
import {
  ProductActorSchema,
  UserId as UserIdSchema,
} from "@ceird/identity-core";
import type {
  OrganizationId,
  ProductActor,
  ProductActorId,
  UserId,
} from "@ceird/identity-core";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

import {
  generateActivityEventId,
  generateProductActorId,
} from "./id-generation.js";

const AGENT_ACTIVITY_ACTOR_DISPLAY_NAME = "Ceird Agent";
const AGENT_ACTIVITY_ACTOR_DISPLAY_DETAIL = "Agent action";

interface ProductActorRow {
  readonly display_detail: string | null;
  readonly display_name: string;
  readonly id: string;
  readonly kind: string;
  readonly route_href: string | null;
  readonly route_label: string | null;
}

interface MemberSourceRow extends ProductActorRow {
  readonly source_user_id: string;
}

interface AgentSourceRow extends ProductActorRow {
  readonly source_agent_thread_id: string;
  readonly source_user_id: string;
}

interface ActivityEventRow {
  readonly actor_id: string;
  readonly created_at: Date;
  readonly display: unknown;
  readonly event_type: string;
  readonly id: string;
  readonly organization_id: string;
  readonly retained_until: Date;
  readonly source_id: string;
  readonly source_type: string;
  readonly status: string;
  readonly target_id: string;
  readonly target_type: string;
}

export interface ResolveMemberActorInput {
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
}

export interface ResolveAgentThreadActorInput {
  readonly organizationId: OrganizationId;
  readonly threadId: AgentThreadId;
  readonly threadTitle?: string | undefined;
  readonly userId: UserId;
}

export interface ResolveAgentActorInput {
  readonly agentThreadId: AgentThreadId;
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
}

export interface RecordActivityEventInput {
  readonly actorId: ProductActorId;
  readonly createdAt?: Date | undefined;
  readonly display: ProductActivityEventDisplayPayload;
  readonly eventType: ActivityEventType;
  readonly id?: ActivityEventId | undefined;
  readonly organizationId: OrganizationId;
  readonly sourceId: string;
  readonly sourceType: ActivityEventSourceType;
  readonly status?: ActivityEventStatus | undefined;
  readonly targetId: string;
  readonly targetType: ActivityEventTargetType;
}

export interface ListRecentActivityEventsQuery {
  readonly limit?: number | undefined;
  readonly now?: Date | undefined;
}

const decodeProductActor = Schema.decodeUnknownSync(ProductActorSchema);
const decodeProductActivityEvent = Schema.decodeUnknownSync(
  ProductActivityEventSchema
);
const decodeProductActivityEventDisplay = Schema.decodeUnknownSync(
  ProductActivityEventDisplayPayloadSchema
);
const decodeUserId = Schema.decodeUnknownSync(UserIdSchema);

export class ActivityEventsRepository extends Context.Service<ActivityEventsRepository>()(
  "@ceird/domains/activity/ActivityEventsRepository",
  {
    make: Effect.gen(function* ActivityEventsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const recordEvent = Effect.fn("ActivityEventsRepository.recordEvent")(
        function* (input: RecordActivityEventInput) {
          const event = normalizeRecordActivityEventInput(input);
          yield* Effect.annotateCurrentSpan(
            "organizationId",
            event.organizationId
          );
          yield* Effect.annotateCurrentSpan("activityEventId", event.id);
          yield* Effect.annotateCurrentSpan(
            "activityEventType",
            event.eventType
          );

          const rows = yield* sql<ActivityEventRow>`
            insert into activity_events (
              id,
              organization_id,
              event_type,
              target_type,
              target_id,
              actor_id,
              source_type,
              source_id,
              display,
              status,
              created_at,
              retained_until
            )
            values (
              ${event.id},
              ${event.organizationId},
              ${event.eventType},
              ${event.targetType},
              ${event.targetId},
              ${event.actorId},
              ${event.sourceType},
              ${event.sourceId},
              ${JSON.stringify(event.display)}::jsonb,
              ${event.status},
              ${event.createdAt},
              ${event.retainedUntil}
            )
            on conflict (organization_id, source_type, source_id) do update
            set
              actor_id = excluded.actor_id,
              display = excluded.display,
              event_type = excluded.event_type,
              retained_until = greatest(
                activity_events.retained_until,
                excluded.retained_until
              ),
              status = excluded.status,
              target_id = excluded.target_id,
              target_type = excluded.target_type
            returning *
          `;

          yield* applyRetention(event.organizationId);

          const row = yield* getRequiredRow(rows, "activity event");

          return mapActivityEventRow(row);
        }
      );

      const listRecent = Effect.fn("ActivityEventsRepository.listRecent")(
        function* (
          organizationId: OrganizationId,
          query: ListRecentActivityEventsQuery = {}
        ) {
          const limit = clampActivityEventLimit(query.limit);
          const now = query.now ?? new Date();

          const rows = yield* sql<ActivityEventRow>`
            select *
            from activity_events
            where organization_id = ${organizationId}
              and retained_until > ${now}
            order by created_at desc, id desc
            limit ${limit}
          `;

          return rows.map(mapActivityEventRow);
        }
      );

      const applyRetention = Effect.fn(
        "ActivityEventsRepository.applyRetention"
      )(function* (organizationId: OrganizationId, now: Date = new Date()) {
        yield* sql`
          delete from activity_events
          where organization_id = ${organizationId}
            and retained_until <= ${now}
        `;

        yield* sql`
          delete from activity_events
          where id in (
            select id
            from (
              select
                id,
                row_number() over (
                  partition by organization_id
                  order by created_at desc, id desc
                ) as retained_rank
              from activity_events
              where organization_id = ${organizationId}
            ) ranked_activity_events
            where retained_rank > ${ACTIVITY_FEED_MAX_EVENTS_PER_ORG}
          )
        `;
      });

      return {
        applyRetention,
        listRecent,
        recordEvent,
      };
    }),
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    ActivityEventsRepository,
    ActivityEventsRepository.make
  );
  static readonly Default = ActivityEventsRepository.DefaultWithoutDependencies;
}

export class ProductActivityActorsRepository extends Context.Service<ProductActivityActorsRepository>()(
  "@ceird/domains/activity/ProductActivityActorsRepository",
  {
    make: Effect.gen(function* ProductActivityActorsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const ensureMemberActor = Effect.fn(
        "ProductActivityActorsRepository.ensureMemberActor"
      )(function* (input: ResolveMemberActorInput) {
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          input.organizationId
        );
        yield* Effect.annotateCurrentSpan("userId", input.userId);

        const rows = yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`
              select pg_advisory_xact_lock(
                hashtext(${buildMemberActorLockKey(input)})
              )
            `;

            const actorId = generateProductActorId();

            return yield* sql<MemberSourceRow>`
              with source_user as (
                select
                  "user".id as source_user_id,
                  coalesce(nullif(trim("user".name), ''), 'Team member') as display_name
                from "user"
                inner join member
                  on member.user_id = "user".id
                where member.organization_id = ${input.organizationId}
                  and member.user_id = ${input.userId}
                limit 1
              ),
              existing_actor as (
                update product_activity_actors
                set
                  display_name = source_user.display_name,
                  display_detail = 'Team member',
                  route_href = null,
                  route_label = null,
                  updated_at = now()
                from product_activity_actor_sources, source_user
                where product_activity_actor_sources.organization_id = ${input.organizationId}
                  and product_activity_actor_sources.kind = 'member'
                  and product_activity_actor_sources.user_id = ${input.userId}
                  and product_activity_actors.id = product_activity_actor_sources.actor_id
                  and product_activity_actors.organization_id = product_activity_actor_sources.organization_id
                returning
                  product_activity_actors.id,
                  product_activity_actors.kind,
                  product_activity_actors.display_name,
                  product_activity_actors.display_detail,
                  product_activity_actors.route_href,
                  product_activity_actors.route_label,
                  source_user.source_user_id
              ),
              inserted_actor as (
                insert into product_activity_actors (
                  id,
                  organization_id,
                  kind,
                  display_name,
                  display_detail
                )
                select
                  ${actorId},
                  ${input.organizationId},
                  'member',
                  source_user.display_name,
                  'Team member'
                from source_user
                where not exists (select 1 from existing_actor)
                returning
                  id,
                  kind,
                  display_name,
                  display_detail,
                  route_href,
                  route_label
              ),
              inserted_actor_with_source as (
                select
                  inserted_actor.id,
                  inserted_actor.kind,
                  inserted_actor.display_name,
                  inserted_actor.display_detail,
                  inserted_actor.route_href,
                  inserted_actor.route_label,
                  source_user.source_user_id
                from inserted_actor
                cross join source_user
              ),
              inserted_source as (
                insert into product_activity_actor_sources (
                  actor_id,
                  organization_id,
                  kind,
                  user_id
                )
                select
                  inserted_actor_with_source.id,
                  ${input.organizationId},
                  'member',
                  inserted_actor_with_source.source_user_id
                from inserted_actor_with_source
                returning actor_id
              ),
              actor_row as (
                select * from existing_actor
                union all
                select inserted_actor_with_source.*
                from inserted_actor_with_source
                inner join inserted_source
                  on inserted_source.actor_id = inserted_actor_with_source.id
              ),
              upserted_member_summary as (
                insert into product_member_actor_summaries (
                  actor_id,
                  organization_id,
                  user_id,
                  display_name,
                  display_detail,
                  route_href,
                  route_label,
                  created_at,
                  updated_at
                )
                select
                  actor_row.id,
                  ${input.organizationId},
                  actor_row.source_user_id,
                  actor_row.display_name,
                  actor_row.display_detail,
                  actor_row.route_href,
                  actor_row.route_label,
                  now(),
                  now()
                from actor_row
                on conflict (actor_id) do update
                set
                  organization_id = excluded.organization_id,
                  user_id = excluded.user_id,
                  display_name = excluded.display_name,
                  display_detail = excluded.display_detail,
                  route_href = excluded.route_href,
                  route_label = excluded.route_label,
                  updated_at = excluded.updated_at
                returning actor_id
              )
              select actor_row.*
              from actor_row
              inner join upserted_member_summary
                on upserted_member_summary.actor_id = actor_row.id
            `;
          })
        );

        const row = yield* getRequiredRow(rows, "product activity actor");
        yield* Effect.annotateCurrentSpan("productActorId", row.id);

        return {
          actor: mapProductActorRow(row),
          sourceUserId: decodeUserId(row.source_user_id),
        };
      });

      const ensureAgentActor = Effect.fn(
        "ProductActivityActorsRepository.ensureAgentActor"
      )(function* (input: ResolveAgentActorInput) {
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          input.organizationId
        );
        yield* Effect.annotateCurrentSpan("userId", input.userId);
        yield* Effect.annotateCurrentSpan("agentThreadId", input.agentThreadId);

        const rows = yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`
              select pg_advisory_xact_lock(
                hashtext(${buildAgentActorLockKey(input)})
              )
            `;

            const actorId = generateProductActorId();

            return yield* sql<AgentSourceRow>`
              with source_thread as (
                select
                  agent_threads.id as source_agent_thread_id,
                  agent_threads.user_id as source_user_id
                from agent_threads
                where agent_threads.organization_id = ${input.organizationId}
                  and agent_threads.user_id = ${input.userId}
                  and agent_threads.id = ${input.agentThreadId}
                  and agent_threads.status = 'active'
                limit 1
              ),
              existing_actor as (
                update product_activity_actors
                set
                  display_name = ${AGENT_ACTIVITY_ACTOR_DISPLAY_NAME},
                  display_detail = ${AGENT_ACTIVITY_ACTOR_DISPLAY_DETAIL},
                  route_href = null,
                  route_label = null,
                  updated_at = now()
                from product_activity_actor_sources, source_thread
                where product_activity_actor_sources.organization_id = ${input.organizationId}
                  and product_activity_actor_sources.kind = 'agent'
                  and product_activity_actor_sources.agent_thread_id = source_thread.source_agent_thread_id
                  and product_activity_actors.id = product_activity_actor_sources.actor_id
                  and product_activity_actors.organization_id = product_activity_actor_sources.organization_id
                returning
                  product_activity_actors.id,
                  product_activity_actors.kind,
                  product_activity_actors.display_name,
                  product_activity_actors.display_detail,
                  product_activity_actors.route_href,
                  product_activity_actors.route_label,
                  source_thread.source_agent_thread_id,
                  source_thread.source_user_id
              ),
              inserted_actor as (
                insert into product_activity_actors (
                  id,
                  organization_id,
                  kind,
                  display_name,
                  display_detail
                )
                select
                  ${actorId},
                  ${input.organizationId},
                  'agent',
                  ${AGENT_ACTIVITY_ACTOR_DISPLAY_NAME},
                  ${AGENT_ACTIVITY_ACTOR_DISPLAY_DETAIL}
                from source_thread
                where not exists (select 1 from existing_actor)
                returning
                  id,
                  kind,
                  display_name,
                  display_detail,
                  route_href,
                  route_label
              ),
              inserted_actor_with_source as (
                select
                  inserted_actor.id,
                  inserted_actor.kind,
                  inserted_actor.display_name,
                  inserted_actor.display_detail,
                  inserted_actor.route_href,
                  inserted_actor.route_label,
                  source_thread.source_agent_thread_id,
                  source_thread.source_user_id
                from inserted_actor
                cross join source_thread
              ),
              inserted_source as (
                insert into product_activity_actor_sources (
                  actor_id,
                  organization_id,
                  kind,
                  user_id,
                  agent_thread_id
                )
                select
                  inserted_actor_with_source.id,
                  ${input.organizationId},
                  'agent',
                  inserted_actor_with_source.source_user_id,
                  inserted_actor_with_source.source_agent_thread_id
                from inserted_actor_with_source
                returning actor_id
              ),
              actor_row as (
                select * from existing_actor
                union all
                select inserted_actor_with_source.*
                from inserted_actor_with_source
                inner join inserted_source
                  on inserted_source.actor_id = inserted_actor_with_source.id
              )
              select *
              from actor_row
            `;
          })
        );

        const row = yield* getRequiredRow(rows, "product activity agent actor");
        yield* Effect.annotateCurrentSpan("productActorId", row.id);

        return {
          actor: mapProductActorRow(row),
          sourceAgentThreadId: row.source_agent_thread_id,
          sourceUserId: decodeUserId(row.source_user_id),
        };
      });

      const ensureAgentThreadActor = Effect.fn(
        "ProductActivityActorsRepository.ensureAgentThreadActor"
      )(function* (input: ResolveAgentThreadActorInput) {
        return yield* ensureAgentActor({
          agentThreadId: input.threadId,
          organizationId: input.organizationId,
          userId: input.userId,
        });
      });

      const getById = Effect.fn("ProductActivityActorsRepository.getById")(
        function* (organizationId: OrganizationId, actorId: ProductActorId) {
          const rows = yield* sql<ProductActorRow>`
            select
              id,
              kind,
              display_name,
              display_detail,
              route_href,
              route_label
            from product_activity_actors
            where organization_id = ${organizationId}
              and id = ${actorId}
            limit 1
          `;

          return rows[0] === undefined
            ? undefined
            : mapProductActorRow(rows[0]);
        }
      );

      return {
        ensureAgentThreadActor,
        ensureAgentActor,
        ensureMemberActor,
        getById,
      };
    }),
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    ProductActivityActorsRepository,
    ProductActivityActorsRepository.make
  );
  static readonly Default =
    ProductActivityActorsRepository.DefaultWithoutDependencies;
}

function mapProductActorRow(row: ProductActorRow): ProductActor {
  return decodeProductActor({
    displayDetail: nullableToUndefined(row.display_detail),
    displayName: row.display_name,
    id: row.id,
    kind: row.kind,
    route:
      row.route_href === null || row.route_label === null
        ? undefined
        : {
            href: row.route_href,
            label: row.route_label,
          },
  });
}

function normalizeRecordActivityEventInput(input: RecordActivityEventInput) {
  const createdAt = input.createdAt ?? new Date();
  const display = decodeProductActivityEventDisplay(input.display);

  return {
    actorId: input.actorId,
    createdAt,
    display,
    eventType: input.eventType,
    id: input.id ?? generateActivityEventId(),
    organizationId: input.organizationId,
    retainedUntil: addDays(createdAt, ACTIVITY_FEED_RETENTION_DAYS),
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    status: input.status ?? "synced",
    targetId: input.targetId,
    targetType: input.targetType,
  } satisfies Required<RecordActivityEventInput> & {
    readonly retainedUntil: Date;
  };
}

function mapActivityEventRow(row: ActivityEventRow): ProductActivityEvent {
  return decodeProductActivityEvent({
    actorId: row.actor_id,
    createdAt: row.created_at.toISOString(),
    display: row.display,
    eventType: row.event_type,
    id: row.id,
    organizationId: row.organization_id,
    retainedUntil: row.retained_until.toISOString(),
    sourceId: row.source_id,
    sourceType: row.source_type,
    status: row.status,
    targetId: row.target_id,
    targetType: row.target_type,
  });
}

function clampActivityEventLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 100;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 500);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

function nullableToUndefined<Value>(value: Value | null): Value | undefined {
  return value === null ? undefined : value;
}

function buildMemberActorLockKey(input: ResolveMemberActorInput): string {
  return `product-activity-actor:member:${input.organizationId}:${input.userId}`;
}

function buildAgentActorLockKey(input: ResolveAgentActorInput): string {
  return `product-activity-actor:agent:${input.organizationId}:${input.agentThreadId}`;
}

function getRequiredRow<Row>(
  rows: readonly Row[],
  label: string
): Effect.Effect<Row> {
  const [row] = rows;

  return row === undefined
    ? Effect.die(new Error(`Expected ${label}`))
    : Effect.succeed(row);
}
