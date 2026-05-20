import { randomUUID } from "node:crypto";

import { AgentActionOperationId } from "@ceird/agents-core";
import { OrganizationId, UserId } from "@ceird/identity-core";
import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Option, Schema } from "effect";

import { AppEffectSqlRuntimeLive } from "../../platform/database/database.js";
import {
  applyAllMigrations,
  canConnect,
  createTestDatabase,
  withPool,
} from "../../platform/database/test-database.js";
import {
  AgentActionRunsRepository,
  AgentThreadsRepository,
} from "./repositories.js";

const decodeAgentActionOperationId = Schema.decodeUnknownSync(
  AgentActionOperationId
);
const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);
const decodeUserId = Schema.decodeUnknownSync(UserId);

describe("agent repositories", () => {
  const cleanup: (() => Promise<void>)[] = [];

  afterAll(async () => {
    await Promise.all([...cleanup].toReversed().map((step) => step()));
  });

  it("indexes user threads and replays action runs by operation id", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "agents_repo" });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Agents integration database unavailable; skipping repository coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);
    const identity = await seedIdentityRecords(testDatabase.url);
    const thread = await runAgentEffect(
      testDatabase.url,
      AgentThreadsRepository.create({
        organizationId: identity.organizationId,
        title: " Quote follow-up ",
        userId: identity.userId,
      })
    );
    const threads = await runAgentEffect(
      testDatabase.url,
      AgentThreadsRepository.listForUser(
        identity.organizationId,
        identity.userId,
        { limit: 50 }
      )
    );
    const actor = await runAgentEffect(
      testDatabase.url,
      AgentThreadsRepository.resolveActiveThreadActor(thread.id)
    );
    const operationId = decodeAgentActionOperationId("tool-call:1");
    const firstRun = await runAgentEffect(
      testDatabase.url,
      AgentActionRunsRepository.begin({
        actionKind: "read",
        actionName: "ceird.labels.list",
        input: {},
        operationId,
        organizationId: identity.organizationId,
        threadId: thread.id,
        userId: identity.userId,
      })
    );
    const replayedRun = await runAgentEffect(
      testDatabase.url,
      AgentActionRunsRepository.begin({
        actionKind: "read",
        actionName: "ceird.labels.list",
        input: {},
        operationId,
        organizationId: identity.organizationId,
        threadId: thread.id,
        userId: identity.userId,
      })
    );
    const completedRun = await runAgentEffect(
      testDatabase.url,
      AgentActionRunsRepository.completeSucceeded(
        firstRun.run.id,
        {
          labels: [],
        },
        { storeResult: true }
      )
    );

    expect(thread.title).toBe("Quote follow-up");
    expect(threads.map((item) => item.id)).toContain(thread.id);
    expect(Option.getOrUndefined(actor)?.actor.role).toBe("owner");
    expect(firstRun.inserted).toBe(true);
    expect(replayedRun.inserted).toBe(false);
    expect(replayedRun.run.id).toBe(firstRun.run.id);
    expect(replayedRun.run.input).toStrictEqual({});
    expect(completedRun.status).toBe("succeeded");
    expect(completedRun.result).toStrictEqual({ labels: [] });
  });
});

async function seedIdentityRecords(databaseUrl: string) {
  const organizationId = decodeOrganizationId(randomUUID());
  const userId = decodeUserId(randomUUID());

  await withPool(databaseUrl, async (pool) => {
    await pool.query(
      `insert into organization (id, name, slug, created_at)
       values ($1, $2, $3, now())`,
      [organizationId, "Northwind Construction", `northwind-${Date.now()}`]
    );
    await pool.query(
      `insert into "user" (id, name, email, email_verified, created_at, updated_at)
       values ($1, $2, $3, true, now(), now())`,
      [userId, "Owner User", `owner-${Date.now()}@example.com`]
    );
    await pool.query(
      `insert into member (id, organization_id, user_id, role, created_at)
       values ($1, $2, $3, 'owner', now())`,
      [randomUUID(), organizationId, userId]
    );
  });

  return { organizationId, userId };
}

async function runAgentEffect<Value, Error, Requirements>(
  databaseUrl: string,
  effect: Effect.Effect<Value, Error, Requirements>
): Promise<Value> {
  return await Effect.runPromise(
    Effect.scoped(
      effect.pipe(
        Effect.provide(AgentThreadsRepository.Default),
        Effect.provide(AgentActionRunsRepository.Default),
        Effect.provide(AppEffectSqlRuntimeLive),
        Effect.withConfigProvider(
          ConfigProvider.fromMap(new Map([["DATABASE_URL", databaseUrl]]))
        )
      ) as Effect.Effect<Value, Error, never>
    )
  );
}
