import { randomUUID } from "node:crypto";

import {
  ActivityEventId,
  ACTIVITY_FEED_MAX_EVENTS_PER_ORG,
  OrganizationId,
  ProductActorId,
} from "@ceird/activity-core";
import { AgentThreadId } from "@ceird/agents-core";
import { UserId } from "@ceird/identity-core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import type { Pool } from "pg";

import { AppEffectSqlRuntimeLive } from "../../platform/database/database.js";
import {
  applyAllMigrations,
  canConnect,
  createTestDatabase,
  withPool,
} from "../../platform/database/test-database.js";
import {
  configProviderFromMap,
  withConfigProvider,
} from "../../test/effect-test-helpers.js";
import {
  ActivityEventsRepository,
  ProductActivityActorsRepository,
} from "./repository.js";

const decodeActivityEventId = Schema.decodeUnknownSync(ActivityEventId);
const decodeAgentThreadId = Schema.decodeUnknownSync(AgentThreadId);
const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);
const decodeProductActorId = Schema.decodeUnknownSync(ProductActorId);
const decodeUserId = Schema.decodeUnknownSync(UserId);
const cleanup: (() => Promise<void>)[] = [];

describe("activity events repository", () => {
  afterAll(async () => {
    await Promise.all([...cleanup].toReversed().map((step) => step()));
  });

  it("records and lists product-safe activity events by organization", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createMigratedTestDatabase(context);
    if (testDatabase === undefined) {
      return;
    }

    const organizationId = decodeOrganizationId(randomUUID());
    const otherOrganizationId = decodeOrganizationId(randomUUID());
    const actorId = decodeProductActorId(randomUUID());
    const otherActorId = decodeProductActorId(randomUUID());
    const now = new Date();
    const createdAt = addMinutes(now, -60);

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Activity Events",
      });
      await seedOrganization(pool, {
        id: otherOrganizationId,
        name: "Other Activity Events",
      });
      await seedProductActivityActor(pool, {
        id: actorId,
        name: "Ciara",
        organizationId,
      });
      await seedProductActivityActor(pool, {
        id: otherActorId,
        name: "Other Actor",
        organizationId: otherOrganizationId,
      });
    });

    const event = await runActivityEventsRepositoryEffect(
      testDatabase.url,
      ActivityEventsRepository.use((repository) =>
        repository.recordEvent({
          actorId,
          createdAt,
          display: {
            detail: "Priority changed from medium to urgent.",
            route: {
              href: "/jobs",
              label: "Open jobs",
            },
            summary: "Job priority changed",
          },
          eventType: "job.priority_changed",
          organizationId,
          sourceId: "job-activity-1",
          sourceType: "job_activity",
          targetId: randomUUID(),
          targetType: "job",
        })
      )
    );

    await runActivityEventsRepositoryEffect(
      testDatabase.url,
      ActivityEventsRepository.use((repository) =>
        repository.recordEvent({
          actorId: otherActorId,
          createdAt,
          display: {
            summary: "Other organization job changed",
          },
          eventType: "job.priority_changed",
          organizationId: otherOrganizationId,
          sourceId: "job-activity-other",
          sourceType: "job_activity",
          targetId: randomUUID(),
          targetType: "job",
        })
      )
    );

    const listed = await runActivityEventsRepositoryEffect(
      testDatabase.url,
      ActivityEventsRepository.use((repository) =>
        repository.listRecent(organizationId, {
          now,
        })
      )
    );

    expect(event).toMatchObject({
      actorId,
      display: {
        summary: "Job priority changed",
      },
      eventType: "job.priority_changed",
      organizationId,
      retainedUntil: addDays(createdAt, 30).toISOString(),
      sourceId: "job-activity-1",
      sourceType: "job_activity",
      status: "synced",
      targetType: "job",
    });
    expect(listed.map((item) => item.id)).toStrictEqual([event.id]);
    expect(JSON.stringify(listed)).not.toContain("Other Actor");
  });

  it("keeps source updates idempotent with stable event ids", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createMigratedTestDatabase(context);
    if (testDatabase === undefined) {
      return;
    }

    const organizationId = decodeOrganizationId(randomUUID());
    const actorId = decodeProductActorId(randomUUID());
    const firstId = decodeActivityEventId(randomUUID());
    const secondId = decodeActivityEventId(randomUUID());
    const firstCreatedAt = addMinutes(new Date(), -10);
    const secondCreatedAt = addMinutes(firstCreatedAt, 5);

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Idempotent Activity",
      });
      await seedProductActivityActor(pool, {
        id: actorId,
        name: "Stable Actor",
        organizationId,
      });
    });

    const first = await runActivityEventsRepositoryEffect(
      testDatabase.url,
      ActivityEventsRepository.use((repository) =>
        repository.recordEvent({
          actorId,
          createdAt: firstCreatedAt,
          display: {
            summary: "Agent action pending",
          },
          eventType: "agent.product_effect",
          id: firstId,
          organizationId,
          sourceId: "agent-run-1",
          sourceType: "agent_action_run",
          status: "pending",
          targetId: "agent-run-1",
          targetType: "agent_action_run",
        })
      )
    );
    const second = await runActivityEventsRepositoryEffect(
      testDatabase.url,
      ActivityEventsRepository.use((repository) =>
        repository.recordEvent({
          actorId,
          createdAt: secondCreatedAt,
          display: {
            summary: "Agent action synced",
          },
          eventType: "agent.product_effect",
          id: secondId,
          organizationId,
          sourceId: "agent-run-1",
          sourceType: "agent_action_run",
          status: "synced",
          targetId: "agent-run-1",
          targetType: "agent_action_run",
        })
      )
    );

    expect(second.id).toBe(first.id);
    expect(second.id).not.toBe(secondId);
    expect(second.status).toBe("synced");
    expect(second.display.summary).toBe("Agent action synced");
    expect(second.createdAt).toBe(first.createdAt);
  });

  it("applies the 30-day retention window and latest-events guardrail", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createMigratedTestDatabase(context);
    if (testDatabase === undefined) {
      return;
    }

    const organizationId = decodeOrganizationId(randomUUID());
    const actorId = decodeProductActorId(randomUUID());
    const now = new Date();

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Retained Activity",
      });
      await seedProductActivityActor(pool, {
        id: actorId,
        name: "Retention Actor",
        organizationId,
      });
      await seedActivityEventRows(pool, {
        actorId,
        count: ACTIVITY_FEED_MAX_EVENTS_PER_ORG + 5,
        createdAt: addMinutes(now, -5),
        organizationId,
      });
    });

    const expired = await runActivityEventsRepositoryEffect(
      testDatabase.url,
      ActivityEventsRepository.use((repository) =>
        repository.recordEvent({
          actorId,
          createdAt: addDays(now, -31),
          display: {
            summary: "Expired job event",
          },
          eventType: "job.created",
          organizationId,
          sourceId: "expired-job-event",
          sourceType: "job_activity",
          targetId: randomUUID(),
          targetType: "job",
        })
      )
    );

    await runActivityEventsRepositoryEffect(
      testDatabase.url,
      ActivityEventsRepository.use((repository) =>
        repository.applyRetention(organizationId, now)
      )
    );

    const count = await withPool(testDatabase.url, async (pool) => {
      const result = await pool.query<{ count: string }>(
        `select count(*)::text as count
         from activity_events
         where organization_id = $1`,
        [organizationId]
      );

      return Number(result.rows[0]?.count ?? 0);
    });
    const listed = await runActivityEventsRepositoryEffect(
      testDatabase.url,
      ActivityEventsRepository.use((repository) =>
        repository.listRecent(organizationId, {
          limit: 10,
          now,
        })
      )
    );

    expect(count).toBe(ACTIVITY_FEED_MAX_EVENTS_PER_ORG);
    expect(listed).toHaveLength(10);
    expect(listed.some((event) => event.id === expired.id)).toBeFalsy();
  });

  it("maintains a synced member actor summary projection", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createMigratedTestDatabase(context);
    if (testDatabase === undefined) {
      return;
    }

    const organizationId = decodeOrganizationId(randomUUID());
    const userId = decodeUserId(`user_${randomUUID()}`);

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Actor Summaries",
      });
      await seedMember(pool, {
        email: "taylor@example.com",
        name: "Taylor Member",
        organizationId,
        userId,
      });
    });

    const created = await runProductActivityActorsRepositoryEffect(
      testDatabase.url,
      ProductActivityActorsRepository.use((repository) =>
        repository.ensureMemberActor({
          organizationId,
          userId,
        })
      )
    );
    const summary = await withPool(testDatabase.url, async (pool) => {
      const result = await pool.query<{
        actor_id: string;
        display_detail: string | null;
        display_name: string;
        user_id: string;
      }>(
        `select actor_id, user_id, display_name, display_detail
         from product_member_actor_summaries
         where organization_id = $1 and user_id = $2`,
        [organizationId, userId]
      );

      return result.rows[0];
    });

    expect(summary).toStrictEqual({
      actor_id: created.actor.id,
      display_detail: "Team member",
      display_name: "Taylor Member",
      user_id: userId,
    });

    await withPool(testDatabase.url, async (pool) => {
      await pool.query(`update "user" set name = $1 where id = $2`, [
        "Taylor Updated",
        userId,
      ]);
    });

    const updated = await runProductActivityActorsRepositoryEffect(
      testDatabase.url,
      ProductActivityActorsRepository.use((repository) =>
        repository.ensureMemberActor({
          organizationId,
          userId,
        })
      )
    );
    const updatedSummary = await withPool(testDatabase.url, async (pool) => {
      const result = await pool.query<{ display_name: string }>(
        `select display_name
         from product_member_actor_summaries
         where actor_id = $1`,
        [created.actor.id]
      );

      return result.rows[0];
    });

    expect(updated.actor.id).toBe(created.actor.id);
    expect(updatedSummary).toStrictEqual({ display_name: "Taylor Updated" });
  });

  it("does not expose private agent thread titles in synced actor projections", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createMigratedTestDatabase(context);
    if (testDatabase === undefined) {
      return;
    }

    const organizationId = decodeOrganizationId(randomUUID());
    const userId = decodeUserId(`user_${randomUUID()}`);
    const threadId = decodeAgentThreadId(randomUUID());
    const privateThreadTitle = "Private acquisition cleanup plan";

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Agent Actor Privacy",
      });
      await seedMember(pool, {
        email: "agent-owner@example.com",
        name: "Agent Owner",
        organizationId,
        userId,
      });
      await seedAgentThread(pool, {
        id: threadId,
        organizationId,
        title: privateThreadTitle,
        userId,
      });
    });

    const created = await runProductActivityActorsRepositoryEffect(
      testDatabase.url,
      ProductActivityActorsRepository.use((repository) =>
        repository.ensureAgentThreadActor({
          organizationId,
          threadId,
          threadTitle: privateThreadTitle,
          userId,
        })
      )
    );
    const syncedActor = await runProductActivityActorsRepositoryEffect(
      testDatabase.url,
      ProductActivityActorsRepository.use((repository) =>
        repository.getById(organizationId, created.actor.id)
      )
    );

    expect(created.actor).toStrictEqual({
      displayDetail: "Agent product action",
      displayName: "Ceird agent",
      id: created.actor.id,
      kind: "agent",
    });
    expect(syncedActor).toStrictEqual(created.actor);
    expect(JSON.stringify({ created, syncedActor })).not.toContain(
      privateThreadTitle
    );
  });
});

async function createMigratedTestDatabase(context: {
  skip: (note?: string) => never;
}) {
  const testDatabase = await createTestDatabase({ prefix: "activity_events" });
  cleanup.push(testDatabase.cleanup);
  const canReachDatabase = await withPool(
    testDatabase.url,
    async (pool) => await canConnect(pool)
  );

  if (!canReachDatabase) {
    return context.skip(
      "Activity events integration database unavailable; skipping repository coverage"
    );
  }

  await applyAllMigrations(testDatabase.url);

  return testDatabase;
}

async function runActivityEventsRepositoryEffect<Value, Error, Requirements>(
  databaseUrl: string,
  effect: Effect.Effect<Value, Error, Requirements>
): Promise<Value> {
  return await Effect.runPromise(
    Effect.scoped(
      effect.pipe(
        Effect.provide(ActivityEventsRepository.Default),
        Effect.provide(AppEffectSqlRuntimeLive),
        withConfigProvider(
          configProviderFromMap(new Map([["DATABASE_URL", databaseUrl]]))
        )
      ) as Effect.Effect<Value, Error, never>
    )
  );
}

async function runProductActivityActorsRepositoryEffect<
  Value,
  Error,
  Requirements,
>(
  databaseUrl: string,
  effect: Effect.Effect<Value, Error, Requirements>
): Promise<Value> {
  return await Effect.runPromise(
    Effect.scoped(
      effect.pipe(
        Effect.provide(ProductActivityActorsRepository.Default),
        Effect.provide(AppEffectSqlRuntimeLive),
        withConfigProvider(
          configProviderFromMap(new Map([["DATABASE_URL", databaseUrl]]))
        )
      ) as Effect.Effect<Value, Error, never>
    )
  );
}

async function seedOrganization(
  pool: Pool,
  input: { readonly id: string; readonly name: string }
) {
  await pool.query(
    `insert into organization (id, name, slug, created_at)
     values ($1, $2, $3, now())`,
    [
      input.id,
      input.name,
      `${input.name.toLowerCase().replaceAll(" ", "-")}-${randomUUID()
        .replaceAll("-", "")
        .slice(0, 12)}`,
    ]
  );
}

async function seedProductActivityActor(
  pool: Pool,
  input: {
    readonly id: string;
    readonly name: string;
    readonly organizationId: string;
  }
) {
  await pool.query(
    `insert into product_activity_actors (
       id,
       organization_id,
       kind,
       display_name,
       display_detail,
       created_at,
       updated_at
     )
     values ($1, $2, 'member', $3, 'Team member', now(), now())`,
    [input.id, input.organizationId, input.name]
  );
}

async function seedMember(
  pool: Pool,
  input: {
    readonly email: string;
    readonly name: string;
    readonly organizationId: string;
    readonly userId: string;
  }
) {
  await pool.query(
    `insert into "user" (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     values ($1, $2, $3, false, false, now(), now())`,
    [input.userId, input.name, input.email]
  );
  await pool.query(
    `insert into member (id, organization_id, user_id, role, created_at)
     values ($1, $2, $3, 'member', now())`,
    [randomUUID(), input.organizationId, input.userId]
  );
}

async function seedAgentThread(
  pool: Pool,
  input: {
    readonly id: string;
    readonly organizationId: string;
    readonly title: string;
    readonly userId: string;
  }
) {
  await pool.query(
    `insert into agent_threads (
       id,
       organization_id,
       user_id,
       agent_instance_name,
       title,
       status,
       created_at,
       updated_at
     )
     values ($1, $2, $3, $4, $5, 'active', now(), now())`,
    [
      input.id,
      input.organizationId,
      input.userId,
      `agent-${input.id}`,
      input.title,
    ]
  );
}

async function seedActivityEventRows(
  pool: Pool,
  input: {
    readonly actorId: string;
    readonly count: number;
    readonly createdAt: Date;
    readonly organizationId: string;
  }
) {
  await pool.query(
    `insert into activity_events (
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
     select
       ('00000000-0000-4000-8000-' || lpad(to_hex(series), 12, '0'))::uuid,
       $1,
       'job.created',
       'job',
       'job-' || series::text,
       $2,
       'job_activity',
       'seed-job-activity-' || series::text,
       jsonb_build_object('summary', 'Seed job activity ' || series::text),
       'synced',
       $3::timestamptz - (series::text || ' seconds')::interval,
       $3::timestamptz + interval '30 days'
     from generate_series(1, $4) series`,
    [
      input.organizationId,
      input.actorId,
      input.createdAt.toISOString(),
      input.count,
    ]
  );
}

function addMinutes(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setUTCMinutes(next.getUTCMinutes() + minutes);

  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);

  return next;
}
