import { randomUUID } from "node:crypto";

import {
  AGENT_ACTION_REJECTED_ERROR_TAG,
  AgentActionOperationId,
} from "@ceird/agents-core";
import { OrganizationId, UserId } from "@ceird/identity-core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";

import { AppDatabaseRuntimeLive } from "../../platform/database/database.js";
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
    const preparedThreads = await Promise.all(
      [
        " Quote follow-up ",
        " Should reuse current ",
        " Concurrent prepare ",
      ].map((title) =>
        runAgentEffect(
          testDatabase.url,
          AgentThreadsRepository.getOrCreateCurrent({
            organizationId: identity.organizationId,
            title,
            userId: identity.userId,
          })
        )
      )
    );
    const [thread] = preparedThreads;
    if (thread === undefined) {
      throw new Error("Expected a prepared agent thread");
    }
    const preparedThreadIds = new Set(preparedThreads.map((item) => item.id));
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
    const inputLedgerValue = {
      byteLength: 2,
      sha256:
        "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    };
    const firstRun = await runAgentEffect(
      testDatabase.url,
      AgentActionRunsRepository.begin({
        actionKind: "read",
        actionName: "ceird.labels.list",
        input: inputLedgerValue,
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
        input: inputLedgerValue,
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
    const lateFailedRun = await runAgentEffect(
      testDatabase.url,
      AgentActionRunsRepository.completeFailed(
        firstRun.run.id,
        "Late stale recovery",
        { tag: AGENT_ACTION_REJECTED_ERROR_TAG }
      )
    );
    const freshRun = await runAgentEffect(
      testDatabase.url,
      AgentActionRunsRepository.begin({
        actionKind: "write",
        actionName: "ceird.labels.create",
        input: inputLedgerValue,
        operationId: decodeAgentActionOperationId("tool-call:2"),
        organizationId: identity.organizationId,
        threadId: thread.id,
        userId: identity.userId,
      })
    );
    const freshStaleAttempt = await runAgentEffect(
      testDatabase.url,
      AgentActionRunsRepository.completeFailed(
        freshRun.run.id,
        "Fresh runs should not be stale",
        { tag: AGENT_ACTION_REJECTED_ERROR_TAG },
        { staleAfterSeconds: 900 }
      )
    );

    expect(preparedThreadIds.size).toBe(1);
    expect(threads.map((item) => item.id)).toStrictEqual([thread.id]);
    expect([
      "Quote follow-up",
      "Should reuse current",
      "Concurrent prepare",
    ]).toContain(thread.title);
    expect(Option.getOrUndefined(actor)?.actor.role).toBe("owner");
    expect(firstRun.inserted).toBe(true);
    expect(replayedRun.inserted).toBe(false);
    expect(replayedRun.run.id).toBe(firstRun.run.id);
    expect(replayedRun.run.input).toStrictEqual(inputLedgerValue);
    expect(completedRun.status).toBe("succeeded");
    expect(completedRun.result).toStrictEqual({ labels: [] });
    expect(lateFailedRun.status).toBe("succeeded");
    expect(lateFailedRun.result).toStrictEqual({ labels: [] });
    expect(freshStaleAttempt.status).toBe("running");
    expect(freshStaleAttempt.errorMessage).toBeNull();

    const archivedThread = await runAgentEffect(
      testDatabase.url,
      AgentThreadsRepository.archive(
        identity.organizationId,
        identity.userId,
        thread.id
      )
    );
    const replacementThread = await runAgentEffect(
      testDatabase.url,
      AgentThreadsRepository.getOrCreateCurrent({
        organizationId: identity.organizationId,
        title: " Replacement current thread ",
        userId: identity.userId,
      })
    );
    const activeThreadsAfterArchive = await runAgentEffect(
      testDatabase.url,
      AgentThreadsRepository.listForUser(
        identity.organizationId,
        identity.userId,
        { limit: 50 }
      )
    );
    const manuallyCreatedThread = await runAgentEffect(
      testDatabase.url,
      AgentThreadsRepository.create({
        organizationId: identity.organizationId,
        title: " Manually newer active ",
        userId: identity.userId,
      })
    );

    await withPool(testDatabase.url, async (pool) => {
      await pool.query(
        `update agent_threads
         set updated_at = case
           when id = $1 then $3::timestamptz
           when id = $2 then $4::timestamptz
           else updated_at
         end
         where id in ($1, $2)`,
        [
          replacementThread.id,
          manuallyCreatedThread.id,
          "2026-05-20T10:00:00.000Z",
          "2026-05-20T10:05:00.000Z",
        ]
      );
    });

    const newestThread = await runAgentEffect(
      testDatabase.url,
      AgentThreadsRepository.getOrCreateCurrent({
        organizationId: identity.organizationId,
        title: " Should reuse the newest active thread ",
        userId: identity.userId,
      })
    );

    expect(Option.getOrUndefined(archivedThread)?.id).toBe(thread.id);
    expect(replacementThread.id).not.toBe(thread.id);
    expect(replacementThread.title).toBe("Replacement current thread");
    expect(activeThreadsAfterArchive.map((item) => item.id)).toStrictEqual([
      replacementThread.id,
    ]);
    expect(newestThread.id).toBe(manuallyCreatedThread.id);
    expect(newestThread.title).toBe("Manually newer active");
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
        Effect.provide(AppDatabaseRuntimeLive),
        withConfigProvider(
          configProviderFromMap(new Map([["DATABASE_URL", databaseUrl]]))
        )
      ) as Effect.Effect<Value, Error, never>
    )
  );
}
