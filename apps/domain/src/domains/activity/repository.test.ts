import { randomUUID } from "node:crypto";

import {
  ActivityEventId,
  ACTIVITY_FEED_MAX_EVENTS_PER_ORG,
  OrganizationId,
  ProductActorId,
} from "@ceird/activity-core";
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
import { ActivityEventsRepository } from "./repository.js";

const decodeActivityEventId = Schema.decodeUnknownSync(ActivityEventId);
const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);
const decodeProductActorId = Schema.decodeUnknownSync(ProductActorId);
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
    const createdAt = new Date("2026-06-15T12:00:00.000Z");

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
          now: new Date("2026-06-16T00:00:00.000Z"),
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
      retainedUntil: "2026-07-15T12:00:00.000Z",
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
          createdAt: new Date("2026-06-15T12:00:00.000Z"),
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
          createdAt: new Date("2026-06-15T12:05:00.000Z"),
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
        organizationId,
      });
    });

    const expired = await runActivityEventsRepositoryEffect(
      testDatabase.url,
      ActivityEventsRepository.use((repository) =>
        repository.recordEvent({
          actorId,
          createdAt: new Date("2026-05-01T12:00:00.000Z"),
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
        repository.applyRetention(
          organizationId,
          new Date("2026-06-16T00:00:00.000Z")
        )
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
          now: new Date("2026-06-16T00:00:00.000Z"),
        })
      )
    );

    expect(count).toBe(ACTIVITY_FEED_MAX_EVENTS_PER_ORG);
    expect(listed).toHaveLength(10);
    expect(listed.some((event) => event.id === expired.id)).toBeFalsy();
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

async function seedActivityEventRows(
  pool: Pool,
  input: {
    readonly actorId: string;
    readonly count: number;
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
       (
         substr(md5(series::text), 1, 8) || '-' ||
         substr(md5(series::text), 9, 4) || '-' ||
         substr(md5(series::text), 13, 4) || '-' ||
         substr(md5(series::text), 17, 4) || '-' ||
         substr(md5(series::text), 21, 12)
       )::uuid,
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
      "2026-06-15T12:00:00.000Z",
      input.count,
    ]
  );
}
