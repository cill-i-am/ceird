# Ceird Agent Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side Ceird agent foundation: domain-owned thread indexes, a Cloudflare Agents SDK Worker, authenticated org/user/thread routing, and an idempotent audited action bridge over the Domain Worker.

**Architecture:** `apps/domain` owns thread records, action-run records, authorization, action execution, Drizzle schema, migrations, and Postgres access. `apps/agent` is a public Cloudflare Worker that hosts the `CeirdAgent` Durable Object through the Agents SDK, stores live chat/runtime state in the agent SQLite store, and calls `apps/domain` through the private `DOMAIN` service binding. Read and destructive actions land together, with every mutating action guarded by a domain-owned idempotency key and audit ledger; client chat UI, WhatsApp, generated UI rendering, and optional approval UX are separate follow-up work.

**Tech Stack:** TypeScript, Effect Schema, Effect HttpApi, Effect SQL, Drizzle/Postgres, Cloudflare Agents SDK, `@cloudflare/ai-chat`, AI SDK, Workers AI, Cloudflare Durable Objects, Alchemy v2, Neon branches.

---

## Direction

This plan supersedes the earlier API-owned agent plan. The new boundary is:

- `apps/domain`: agent thread API, SQL schema, repositories, authorization, internal agent token signing, action-run idempotency, audit records, and action execution.
- `apps/agent`: public Agent Worker and `CeirdAgent` Durable Object only. It has no Hyperdrive/Postgres binding and no product repositories.
- `packages/agents-core`: shared DTOs, instance-name helpers, and HTTP API contracts.
- `infra`: Alchemy-managed Worker, Durable Object namespace, AI binding, `DOMAIN` service binding, stage hostname, and shared internal secret.

The first action bridge exposes both read and destructive domain actions to the LLM because the product is not launched yet. Mutating actions are allowed only through an `operationId` supplied by the Agent Worker, recorded in `agent_action_runs`, and replay-safe through a unique `(thread_id, operation_id)` database constraint. Human approval can be added later as a policy mode over the same action ledger.

## File Structure

- Create `packages/agents-core/package.json`: shared agent contract package metadata.
- Create `packages/agents-core/tsconfig.json`: TypeScript build config.
- Create `packages/agents-core/src/index.ts`: branded thread IDs, instance-name helpers, DTO schemas, and HttpApi groups.
- Create `packages/agents-core/src/index.test.ts`: schema and instance-name tests.
- Create `apps/domain/src/domains/agents/schema.ts`: Drizzle `agent_threads` and `agent_action_runs` tables.
- Create `apps/domain/src/domains/agents/id-generation.ts`: thread UUID helper.
- Create `apps/domain/src/domains/agents/repositories.ts`: Effect SQL thread repository and action-run ledger repository.
- Create `apps/domain/src/domains/agents/repositories.test.ts`: repository and idempotency ledger integration tests.
- Create `apps/domain/src/domains/agents/internal-token.ts`: HMAC token signing/verification for trusted Agent Worker calls.
- Create `apps/domain/src/domains/agents/internal-token.test.ts`: token tests.
- Create `apps/domain/src/domains/agents/actions.ts`: read/write action registry, kind metadata, payload decoding, and executor.
- Create `apps/domain/src/domains/agents/actions.test.ts`: action policy and destructive action execution tests.
- Create `apps/domain/src/domains/agents/service.ts`: thread service, actor authorization, agent connect authorization, and action dispatch.
- Create `apps/domain/src/domains/agents/service.test.ts`: service tests.
- Create `apps/domain/src/domains/agents/http.ts`: HttpApi handlers for thread CRUD, connect authorization, and internal action execution.
- Create `apps/domain/src/domains/agents/http.test.ts`: HTTP boundary tests.
- Modify `apps/domain/src/http-api.ts`: add `AgentThreadsApiGroup` and `AgentInternalApiGroup`.
- Modify `apps/domain/src/server.ts`: provide `AgentThreadsHttpLive`.
- Modify `apps/domain/src/platform/database/schema.ts`: merge `agentsSchema`.
- Modify `apps/domain/src/platform/cloudflare/env.ts`: add `AGENT_INTERNAL_SECRET`.
- Modify `infra/domain-drizzle-schema.ts`: export `agentThread` and `agentsSchema`.
- Generate migration under `apps/domain/drizzle`: create `agent_threads`.
- Update generated Alchemy migration snapshot under `apps/domain/drizzle/alchemy`.
- Create `apps/agent/AGENTS.md`: ownership rules for the Agent Worker.
- Create `apps/agent/README.md`: operator/developer notes.
- Create `apps/agent/package.json`: Agent Worker dependencies.
- Create `apps/agent/tsconfig.json`: Worker TypeScript config.
- Create `apps/agent/vitest.config.ts`: test config.
- Create `apps/agent/src/platform/cloudflare/env.ts`: typed bindings/env.
- Create `apps/agent/src/domain-client.ts`: `DOMAIN` service-binding client for agent auth and actions.
- Create `apps/agent/src/instance.ts`: instance-name extraction and validation.
- Create `apps/agent/src/tools.ts`: AI SDK read/write tools backed by idempotent domain actions.
- Create `apps/agent/src/ceird-agent.ts`: `CeirdAgent` `AIChatAgent` implementation.
- Create `apps/agent/src/worker.ts`: Worker route/auth entrypoint.
- Create `apps/agent/src/worker.test.ts`: Worker/auth routing tests.
- Modify `infra/stages.ts`: add `agentHostname`.
- Modify `infra/stages.test.ts`: cover default/override hostnames.
- Modify `infra/cloudflare-stack.ts`: add Agent Worker, DO namespace, AI binding, `DOMAIN` binding, and stack output.
- Modify `infra/cloudflare-stack.test.ts`: lock binding/env/output contracts.
- Modify `README.md`, `apps/README.md`, `docs/architecture/system-overview.md`, `docs/architecture/api.md`, `docs/architecture/data-layer.md`, `docs/architecture/local-development-and-infra.md`, and `docs/architecture/packages.md`: document the new agent-side boundary.

---

### Task 1: Shared Agent Contracts

**Files:**

- Create: `packages/agents-core/package.json`
- Create: `packages/agents-core/tsconfig.json`
- Create: `packages/agents-core/src/index.ts`
- Create: `packages/agents-core/src/index.test.ts`

- [ ] **Step 1: Write the failing shared contract tests**

Create `packages/agents-core/src/index.test.ts`:

```ts
import { ParseResult, Schema } from "effect";

import {
  AgentInstanceName,
  AgentThreadListResponseSchema,
  CreateAgentThreadInputSchema,
  buildAgentInstanceName,
  parseAgentInstanceName,
} from "./index.js";

const decodeCreateInput = ParseResult.decodeUnknownSync(
  CreateAgentThreadInputSchema
);
const decodeListResponse = ParseResult.decodeUnknownSync(
  AgentThreadListResponseSchema
);
const decodeInstanceName = Schema.decodeUnknownSync(AgentInstanceName);

describe("@ceird/agents-core", () => {
  it("builds and parses deterministic org/user/thread instance names", () => {
    const name = buildAgentInstanceName({
      organizationId: "org:with/slash",
      threadId: "11111111-1111-4111-8111-111111111111",
      userId: "user:with/slash",
    });

    expect(name).toBe(
      "org:org%3Awith%2Fslash:user:user%3Awith%2Fslash:thread:11111111-1111-4111-8111-111111111111"
    );
    expect(decodeInstanceName(name)).toBe(name);
    expect(parseAgentInstanceName(name)).toStrictEqual({
      organizationId: "org:with/slash",
      threadId: "11111111-1111-4111-8111-111111111111",
      userId: "user:with/slash",
    });
  });

  it("rejects malformed instance names", () => {
    expect(() => parseAgentInstanceName("org:a:user:b")).toThrow(
      /Invalid agent instance name/
    );
    expect(() => decodeInstanceName("not-an-agent-name")).toThrow();
  });

  it("normalizes create input and list responses", () => {
    expect(
      decodeCreateInput({ title: "  Follow up on quote  " })
    ).toStrictEqual({ title: "Follow up on quote" });
    expect(decodeCreateInput({})).toStrictEqual({});

    expect(
      decodeListResponse({
        items: [
          {
            agentInstanceName:
              "org:org_123:user:user_123:thread:11111111-1111-4111-8111-111111111111",
            createdAt: "2026-05-18T10:00:00.000Z",
            id: "11111111-1111-4111-8111-111111111111",
            lastMessageAt: null,
            status: "active",
            title: "New thread",
            updatedAt: "2026-05-18T10:00:00.000Z",
          },
        ],
      }).items[0]?.status
    ).toBe("active");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --filter @ceird/agents-core test
```

Expected: FAIL because `@ceird/agents-core` does not exist yet.

- [ ] **Step 3: Create package metadata**

Create `packages/agents-core/package.json`:

```json
{
  "name": "@ceird/agents-core",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "check-types": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run --globals"
  },
  "dependencies": {
    "@effect/platform": "^0.96.1",
    "effect": "^3.21.2"
  },
  "devDependencies": {
    "@effect/language-service": "^0.84.3",
    "@types/node": "^25.6.0",
    "typescript": "5.9.2",
    "vitest": "^3.2.4"
  }
}
```

Create `packages/agents-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true,
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Add schemas, helpers, and API groups**

Create `packages/agents-core/src/index.ts`:

```ts
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { ParseResult, Schema } from "effect";

export const AgentThreadId = Schema.UUID.pipe(
  Schema.brand("@ceird/agents-core/AgentThreadId")
);
export type AgentThreadId = Schema.Schema.Type<typeof AgentThreadId>;

export const AgentThreadStatus = Schema.Literals("active", "archived");
export type AgentThreadStatus = Schema.Schema.Type<typeof AgentThreadStatus>;

export const AgentInstanceName = Schema.String.pipe(
  Schema.pattern(/^org:[^:]+:user:[^:]+:thread:[0-9a-f-]{36}$/),
  Schema.brand("@ceird/agents-core/AgentInstanceName")
);
export type AgentInstanceName = Schema.Schema.Type<typeof AgentInstanceName>;

export const AgentThreadSchema = Schema.Struct({
  agentInstanceName: AgentInstanceName,
  createdAt: Schema.String,
  id: AgentThreadId,
  lastMessageAt: Schema.NullOr(Schema.String),
  status: AgentThreadStatus,
  title: Schema.String,
  updatedAt: Schema.String,
});
export type AgentThread = Schema.Schema.Type<typeof AgentThreadSchema>;

export const CreateAgentThreadInputSchema = Schema.Struct({
  title: Schema.optionalWith(
    Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(120)),
    { exact: true }
  ),
});
export type CreateAgentThreadInput = Schema.Schema.Type<
  typeof CreateAgentThreadInputSchema
>;

export const AgentThreadListResponseSchema = Schema.Struct({
  items: Schema.Array(AgentThreadSchema),
});

export const AgentThreadResponseSchema = Schema.Struct({
  item: AgentThreadSchema,
});

export const AgentConnectAuthorizationSchema = Schema.Struct({
  agentInstanceName: AgentInstanceName,
  token: Schema.String,
});

export const AgentActionNameSchema = Schema.Literals(
  "ceird.labels.list",
  "ceird.sites.options",
  "ceird.jobs.list",
  "ceird.jobs.detail",
  "ceird.jobs.options",
  "ceird.jobs.add_comment",
  "ceird.jobs.assign_label",
  "ceird.jobs.remove_label"
);
export type AgentActionName = Schema.Schema.Type<typeof AgentActionNameSchema>;

export const AgentActionKindSchema = Schema.Literals(
  "read",
  "write",
  "destructive"
);
export type AgentActionKind = Schema.Schema.Type<typeof AgentActionKindSchema>;

export const AgentActionOperationId = Schema.String.pipe(
  Schema.pattern(/^[a-zA-Z0-9_.:-]{8,160}$/),
  Schema.brand("@ceird/agents-core/AgentActionOperationId")
);
export type AgentActionOperationId = Schema.Schema.Type<
  typeof AgentActionOperationId
>;

export const RunAgentActionInputSchema = Schema.Struct({
  input: Schema.Unknown,
  name: AgentActionNameSchema,
  operationId: AgentActionOperationId,
  threadId: AgentThreadId,
});

export const RunAgentActionResponseSchema = Schema.Struct({
  actionRunId: Schema.UUID,
  replayed: Schema.Boolean,
  result: Schema.Unknown,
});

export class AgentAccessDeniedError extends Schema.TaggedError<AgentAccessDeniedError>()(
  "@ceird/agents-core/AgentAccessDeniedError",
  { message: Schema.String }
) {}

export class AgentThreadNotFoundError extends Schema.TaggedError<AgentThreadNotFoundError>()(
  "@ceird/agents-core/AgentThreadNotFoundError",
  { message: Schema.String }
) {}

export class AgentStorageError extends Schema.TaggedError<AgentStorageError>()(
  "@ceird/agents-core/AgentStorageError",
  { cause: Schema.optional(Schema.String), message: Schema.String }
) {}

export class AgentActionRejectedError extends Schema.TaggedError<AgentActionRejectedError>()(
  "@ceird/agents-core/AgentActionRejectedError",
  { message: Schema.String, name: Schema.String }
) {}

export const AgentThreadsApiGroup = HttpApiGroup.make("agentThreads")
  .add(
    HttpApiEndpoint.get("listAgentThreads", "/agent/threads")
      .addSuccess(AgentThreadListResponseSchema)
      .addError(AgentAccessDeniedError)
      .addError(AgentStorageError)
  )
  .add(
    HttpApiEndpoint.post("createAgentThread", "/agent/threads")
      .setPayload(CreateAgentThreadInputSchema)
      .addSuccess(AgentThreadResponseSchema, { status: 201 })
      .addError(AgentAccessDeniedError)
      .addError(AgentStorageError)
  )
  .add(
    HttpApiEndpoint.post(
      "archiveAgentThread",
      "/agent/threads/:threadId/archive"
    )
      .setPath(Schema.Struct({ threadId: AgentThreadId }))
      .addSuccess(AgentThreadResponseSchema)
      .addError(AgentAccessDeniedError)
      .addError(AgentThreadNotFoundError)
      .addError(AgentStorageError)
  )
  .add(
    HttpApiEndpoint.post(
      "authorizeAgentConnect",
      "/agent/threads/:threadId/authorize"
    )
      .setPath(Schema.Struct({ threadId: AgentThreadId }))
      .addSuccess(AgentConnectAuthorizationSchema)
      .addError(AgentAccessDeniedError)
      .addError(AgentThreadNotFoundError)
      .addError(AgentStorageError)
  );

export const AgentInternalApiGroup = HttpApiGroup.make("agentInternal").add(
  HttpApiEndpoint.post("runAgentAction", "/agent/internal/actions")
    .setPayload(RunAgentActionInputSchema)
    .addSuccess(RunAgentActionResponseSchema)
    .addError(AgentAccessDeniedError)
    .addError(AgentActionRejectedError)
    .addError(AgentThreadNotFoundError)
    .addError(AgentStorageError)
);

export function buildAgentInstanceName(input: {
  readonly organizationId: string;
  readonly threadId: string;
  readonly userId: string;
}): AgentInstanceName {
  const raw = `org:${encodeURIComponent(input.organizationId)}:user:${encodeURIComponent(
    input.userId
  )}:thread:${input.threadId}`;

  return Schema.decodeUnknownSync(AgentInstanceName)(raw);
}

export function parseAgentInstanceName(value: string) {
  const match = /^org:([^:]+):user:([^:]+):thread:([0-9a-f-]{36})$/.exec(value);

  if (!match) {
    throw new Error(`Invalid agent instance name: ${value}`);
  }

  return {
    organizationId: decodeURIComponent(match[1] ?? ""),
    userId: decodeURIComponent(match[2] ?? ""),
    threadId: match[3] ?? "",
  };
}

export const decodeAgentInstanceName =
  ParseResult.decodeUnknownSync(AgentInstanceName);
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm --filter @ceird/agents-core test
pnpm --filter @ceird/agents-core check-types
```

Expected: PASS.

Commit:

```bash
git add packages/agents-core pnpm-lock.yaml
git commit -m "feat(agents): add shared agent contracts"
```

---

### Task 2: Domain-Owned Thread And Action Persistence

**Files:**

- Create: `apps/domain/src/domains/agents/schema.ts`
- Create: `apps/domain/src/domains/agents/id-generation.ts`
- Create: `apps/domain/src/domains/agents/repositories.ts`
- Create: `apps/domain/src/domains/agents/repositories.test.ts`
- Modify: `apps/domain/src/platform/database/schema.ts`
- Modify: `infra/domain-drizzle-schema.ts`
- Generate: `apps/domain/drizzle/*agent_threads*.sql`
- Update: `apps/domain/drizzle/meta/_journal.json`
- Update: `apps/domain/drizzle/alchemy`
- Modify: `apps/domain/package.json`

- [ ] **Step 1: Write the failing repository test**

Create `apps/domain/src/domains/agents/repositories.test.ts`:

```ts
import { buildAgentInstanceName } from "@ceird/agents-core";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { makeTestDatabaseLayer } from "../../platform/database/test-database.js";
import { AgentThreadsRepository } from "./repositories.js";

const TestLive = AgentThreadsRepository.Default.pipe(
  Effect.provideLayer(makeTestDatabaseLayer())
);

describe("AgentThreadsRepository", () => {
  it.effect("creates, lists, touches, and archives user-owned threads", () =>
    Effect.gen(function* () {
      const repository = yield* AgentThreadsRepository;
      const organizationId = "org_test";
      const userId = "user_test";
      const threadId = "11111111-1111-4111-8111-111111111111";
      const agentInstanceName = buildAgentInstanceName({
        organizationId,
        threadId,
        userId,
      });

      const created = yield* repository.create({
        agentInstanceName,
        id: threadId,
        organizationId,
        title: "Follow up",
        userId,
      });

      expect(created.status).toBe("active");
      expect(created.lastMessageAt).toBeNull();

      yield* repository.touchLastMessageAt({
        id: threadId,
        organizationId,
        userId,
      });

      const listed = yield* repository.listForUser({ organizationId, userId });
      expect(listed).toHaveLength(1);
      expect(listed[0]?.id).toBe(threadId);
      expect(listed[0]?.lastMessageAt).not.toBeNull();

      const archived = yield* repository.archive({
        id: threadId,
        organizationId,
        userId,
      });

      expect(archived.status).toBe("archived");
      expect(
        yield* repository.findActiveById({
          id: threadId,
          organizationId,
          userId,
        })
      ).toBeUndefined();

      const started = yield* repository.startActionRun({
        actionKind: "destructive",
        actionName: "ceird.jobs.remove_label",
        id: "22222222-2222-4222-8222-222222222222",
        input: { labelId: "label_1", workItemId: "job_1" },
        operationId: "tool-call-1",
        organizationId,
        threadId,
        userId,
      });

      expect(started.replayed).toBe(false);

      yield* repository.completeActionRun({
        id: started.item.id,
        result: { ok: true },
      });

      const replayed = yield* repository.startActionRun({
        actionKind: "destructive",
        actionName: "ceird.jobs.remove_label",
        id: "33333333-3333-4333-8333-333333333333",
        input: { labelId: "label_1", workItemId: "job_1" },
        operationId: "tool-call-1",
        organizationId,
        threadId,
        userId,
      });

      expect(replayed.replayed).toBe(true);
      expect(replayed.item.result).toStrictEqual({ ok: true });
    }).pipe(Effect.provide(TestLive))
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --filter domain test -- src/domains/agents/repositories.test.ts
```

Expected: FAIL because `AgentThreadsRepository` does not exist.

- [ ] **Step 3: Add package dependency and Drizzle schema**

Add this dependency to `apps/domain/package.json`:

```json
"@ceird/agents-core": "workspace:*"
```

Create `apps/domain/src/domains/agents/id-generation.ts`:

```ts
import { AgentThreadId } from "@ceird/agents-core";
import { Schema } from "effect";

export function makeAgentThreadId(): AgentThreadId {
  return Schema.decodeUnknownSync(AgentThreadId)(crypto.randomUUID());
}
```

Create `apps/domain/src/domains/agents/schema.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const agentsSchema = pgSchema("public");

export const agentThread = agentsSchema.table(
  "agent_threads",
  {
    agentInstanceName: text("agent_instance_name").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: uuid("id").primaryKey(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    organizationId: text("organization_id").notNull(),
    status: text("status").notNull().default("active"),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [
    index("agent_threads_org_user_status_idx").on(
      table.organizationId,
      table.userId,
      table.status,
      table.updatedAt
    ),
    sql`constraint agent_threads_status_chk check (${table.status} in ('active', 'archived'))`,
  ]
);

export const agentActionRun = agentsSchema.table(
  "agent_action_runs",
  {
    actionKind: text("action_kind").notNull(),
    actionName: text("action_name").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    error: jsonb("error"),
    id: uuid("id").primaryKey(),
    input: jsonb("input").notNull(),
    operationId: text("operation_id").notNull(),
    organizationId: text("organization_id").notNull(),
    result: jsonb("result"),
    status: text("status").notNull().default("running"),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => agentThread.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
  },
  (table) => [
    uniqueIndex("agent_action_runs_thread_operation_idx").on(
      table.threadId,
      table.operationId
    ),
    index("agent_action_runs_thread_created_idx").on(
      table.threadId,
      table.createdAt
    ),
    sql`constraint agent_action_runs_status_chk check (${table.status} in ('running', 'succeeded', 'failed'))`,
    sql`constraint agent_action_runs_kind_chk check (${table.actionKind} in ('read', 'write', 'destructive'))`,
  ]
);
```

Modify `apps/domain/src/platform/database/schema.ts`:

```ts
import { agentsSchema } from "../../domains/agents/schema.js";

export {
  agentActionRun,
  agentThread,
  agentsSchema,
} from "../../domains/agents/schema.js";

export const databaseSchema = {
  ...authSchema,
  ...commentsSchema,
  ...labelsSchema,
  ...sitesSchema,
  ...jobsSchema,
  ...agentsSchema,
};
```

Modify `infra/domain-drizzle-schema.ts` by adding `"agentActionRun"`, `"agentThread"`, and `"agentsSchema"` to `schemaExportNames`, then add:

```ts
export const agentActionRun = requireSchemaExport("agentActionRun");
export const agentThread = requireSchemaExport("agentThread");
export const agentsSchema = requireSchemaExport("agentsSchema");
```

- [ ] **Step 4: Add the repository implementation**

Create `apps/domain/src/domains/agents/repositories.ts`:

```ts
import type {
  AgentActionKind,
  AgentActionName,
  AgentInstanceName,
  AgentThread,
  AgentThreadId,
} from "@ceird/agents-core";
import { AgentStorageError } from "@ceird/agents-core";
import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

interface AgentThreadRow {
  readonly agent_instance_name: string;
  readonly created_at: Date;
  readonly id: string;
  readonly last_message_at: Date | null;
  readonly status: "active" | "archived";
  readonly title: string;
  readonly updated_at: Date;
}

interface AgentActionRunRow {
  readonly action_kind: AgentActionKind;
  readonly action_name: AgentActionName;
  readonly completed_at: Date | null;
  readonly created_at: Date;
  readonly error: unknown | null;
  readonly id: string;
  readonly input: unknown;
  readonly operation_id: string;
  readonly result: unknown | null;
  readonly status: "failed" | "running" | "succeeded";
  readonly thread_id: string;
}

export class AgentThreadsRepository extends Effect.Service<AgentThreadsRepository>()(
  "@ceird/domains/agents/AgentThreadsRepository",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const mapRow = (row: AgentThreadRow): AgentThread => ({
        agentInstanceName: row.agent_instance_name as AgentInstanceName,
        createdAt: row.created_at.toISOString(),
        id: row.id as AgentThreadId,
        lastMessageAt: row.last_message_at?.toISOString() ?? null,
        status: row.status,
        title: row.title,
        updatedAt: row.updated_at.toISOString(),
      });
      const mapActionRun = (row: AgentActionRunRow) => ({
        actionKind: row.action_kind,
        actionName: row.action_name,
        completedAt: row.completed_at?.toISOString() ?? null,
        createdAt: row.created_at.toISOString(),
        error: row.error,
        id: row.id,
        input: row.input,
        operationId: row.operation_id,
        result: row.result,
        status: row.status,
        threadId: row.thread_id,
      });

      return {
        create: (input: {
          readonly agentInstanceName: AgentInstanceName;
          readonly id: string;
          readonly organizationId: string;
          readonly title: string;
          readonly userId: string;
        }) =>
          sql<AgentThreadRow>`
            insert into agent_threads (
              id,
              organization_id,
              user_id,
              agent_instance_name,
              title,
              status
            )
            values (
              ${input.id},
              ${input.organizationId},
              ${input.userId},
              ${input.agentInstanceName},
              ${input.title},
              'active'
            )
            returning id, agent_instance_name, title, status, created_at, updated_at, last_message_at
          `.pipe(
            Effect.map((rows) => mapRow(rows[0]!)),
            mapSqlError
          ),

        listForUser: (input: {
          readonly organizationId: string;
          readonly userId: string;
        }) =>
          sql<AgentThreadRow>`
            select id, agent_instance_name, title, status, created_at, updated_at, last_message_at
            from agent_threads
            where organization_id = ${input.organizationId}
              and user_id = ${input.userId}
            order by updated_at desc, created_at desc
          `.pipe(
            Effect.map((rows) => rows.map(mapRow)),
            mapSqlError
          ),

        findActiveById: (input: {
          readonly id: string;
          readonly organizationId: string;
          readonly userId: string;
        }) =>
          sql<AgentThreadRow>`
            select id, agent_instance_name, title, status, created_at, updated_at, last_message_at
            from agent_threads
            where id = ${input.id}
              and organization_id = ${input.organizationId}
              and user_id = ${input.userId}
              and status = 'active'
            limit 1
          `.pipe(
            Effect.map((rows) => (rows[0] ? mapRow(rows[0]) : undefined)),
            mapSqlError
          ),

        touchLastMessageAt: (input: {
          readonly id: string;
          readonly organizationId: string;
          readonly userId: string;
        }) =>
          sql`
            update agent_threads
            set last_message_at = now(),
                updated_at = now()
            where id = ${input.id}
              and organization_id = ${input.organizationId}
              and user_id = ${input.userId}
          `.pipe(Effect.asVoid, mapSqlError),

        archive: (input: {
          readonly id: string;
          readonly organizationId: string;
          readonly userId: string;
        }) =>
          sql<AgentThreadRow>`
            update agent_threads
            set status = 'archived',
                updated_at = now()
            where id = ${input.id}
              and organization_id = ${input.organizationId}
              and user_id = ${input.userId}
            returning id, agent_instance_name, title, status, created_at, updated_at, last_message_at
          `.pipe(
            Effect.map((rows) => (rows[0] ? mapRow(rows[0]) : undefined)),
            mapSqlError
          ),

        startActionRun: (input: {
          readonly actionKind: AgentActionKind;
          readonly actionName: AgentActionName;
          readonly id: string;
          readonly input: unknown;
          readonly operationId: string;
          readonly organizationId: string;
          readonly threadId: string;
          readonly userId: string;
        }) =>
          sql<AgentActionRunRow>`
            insert into agent_action_runs (
              id,
              thread_id,
              organization_id,
              user_id,
              operation_id,
              action_name,
              action_kind,
              input,
              status
            )
            values (
              ${input.id},
              ${input.threadId},
              ${input.organizationId},
              ${input.userId},
              ${input.operationId},
              ${input.actionName},
              ${input.actionKind},
              ${JSON.stringify(input.input)}::jsonb,
              'running'
            )
            on conflict (thread_id, operation_id) do update
              set operation_id = excluded.operation_id
            returning id, thread_id, operation_id, action_name, action_kind, input, result, error, status, created_at, completed_at
          `.pipe(
            Effect.map((rows) => {
              const item = mapActionRun(rows[0]!);
              return {
                item,
                replayed: item.id !== input.id,
              };
            }),
            mapSqlError
          ),

        completeActionRun: (input: {
          readonly id: string;
          readonly result: unknown;
        }) =>
          sql<AgentActionRunRow>`
            update agent_action_runs
            set status = 'succeeded',
                result = ${JSON.stringify(input.result)}::jsonb,
                completed_at = now()
            where id = ${input.id}
            returning id, thread_id, operation_id, action_name, action_kind, input, result, error, status, created_at, completed_at
          `.pipe(
            Effect.map((rows) => mapActionRun(rows[0]!)),
            mapSqlError
          ),

        failActionRun: (input: {
          readonly error: unknown;
          readonly id: string;
        }) =>
          sql<AgentActionRunRow>`
            update agent_action_runs
            set status = 'failed',
                error = ${JSON.stringify(input.error)}::jsonb,
                completed_at = now()
            where id = ${input.id}
            returning id, thread_id, operation_id, action_name, action_kind, input, result, error, status, created_at, completed_at
          `.pipe(
            Effect.map((rows) => mapActionRun(rows[0]!)),
            mapSqlError
          ),
      };
    }),
  }
) {}

function mapSqlError<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.mapError(
      (error) =>
        new AgentStorageError({
          cause: error instanceof Error ? error.message : String(error),
          message: "Agent thread storage operation failed",
        })
    )
  );
}
```

- [ ] **Step 5: Generate and inspect migrations**

Run:

```bash
pnpm --filter domain db:generate
CEIRD_CLOUDFLARE=1 pnpm alchemy plan --env-file .env.local --stage codex-agent-runtime
```

Expected: the Drizzle migration creates `agent_threads` and `agent_action_runs` under `apps/domain/drizzle`; the Alchemy plan refreshes `apps/domain/drizzle/alchemy` if the schema snapshot changed. Do not approve any deploy.

Inspect:

```bash
rg -n "agent_threads|agent_action_runs|agent_action_runs_thread_operation_idx|agent_threads_status_chk" apps/domain/drizzle infra/domain-drizzle-schema.ts apps/domain/src/platform/database/schema.ts
```

Expected: matches only under `apps/domain` and `infra/domain-drizzle-schema.ts`, not `apps/api`.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
pnpm --filter domain test -- src/domains/agents/repositories.test.ts
pnpm --filter domain check-types
```

Expected: PASS.

Commit:

```bash
git add apps/domain/package.json apps/domain/src/domains/agents apps/domain/src/platform/database/schema.ts infra/domain-drizzle-schema.ts apps/domain/drizzle pnpm-lock.yaml
git commit -m "feat(agents): persist domain-owned agent threads"
```

---

### Task 3: Domain Agent Services, Tokens, And Idempotent Actions

**Files:**

- Create: `apps/domain/src/domains/agents/internal-token.ts`
- Create: `apps/domain/src/domains/agents/internal-token.test.ts`
- Create: `apps/domain/src/domains/agents/actions.ts`
- Create: `apps/domain/src/domains/agents/actions.test.ts`
- Create: `apps/domain/src/domains/agents/service.ts`
- Create: `apps/domain/src/domains/agents/service.test.ts`
- Create: `apps/domain/src/domains/agents/http.ts`
- Create: `apps/domain/src/domains/agents/http.test.ts`
- Modify: `apps/domain/src/http-api.ts`
- Modify: `apps/domain/src/server.ts`
- Modify: `apps/domain/src/platform/cloudflare/env.ts`
- Modify: `infra/cloudflare-stack.ts`

- [ ] **Step 1: Write token tests**

Create `apps/domain/src/domains/agents/internal-token.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";

import {
  signAgentInternalToken,
  verifyAgentInternalToken,
} from "./internal-token.js";

describe("agent internal token", () => {
  it("round-trips signed claims and rejects tampering", async () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const token = await signAgentInternalToken(secret, {
      organizationId: "org_123",
      threadId: "11111111-1111-4111-8111-111111111111",
      userId: "user_123",
    });

    await expect(
      verifyAgentInternalToken(secret, token)
    ).resolves.toMatchObject({
      organizationId: "org_123",
      threadId: "11111111-1111-4111-8111-111111111111",
      userId: "user_123",
    });

    await expect(
      verifyAgentInternalToken(secret, `${token.slice(0, -2)}xx`)
    ).rejects.toThrow(/Invalid agent internal token/);
  });
});
```

- [ ] **Step 2: Implement internal token signing**

Create `apps/domain/src/domains/agents/internal-token.ts`:

```ts
export interface AgentInternalTokenClaims {
  readonly organizationId: string;
  readonly threadId: string;
  readonly userId: string;
}

export async function signAgentInternalToken(
  secret: string,
  claims: AgentInternalTokenClaims
) {
  const payload = encodeBase64Url(
    JSON.stringify({
      ...claims,
      exp: Math.floor(Date.now() / 1000) + 15 * 60,
    })
  );
  const signature = await sign(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifyAgentInternalToken(secret: string, token: string) {
  const [payload, signature] = token.split(".");

  if (!payload || !signature || (await sign(secret, payload)) !== signature) {
    throw new Error("Invalid agent internal token");
  }

  const decoded = JSON.parse(
    decodeBase64Url(payload)
  ) as AgentInternalTokenClaims & {
    readonly exp?: number;
  };

  if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Invalid agent internal token: expired");
  }

  return {
    organizationId: decoded.organizationId,
    threadId: decoded.threadId,
    userId: decoded.userId,
  } satisfies AgentInternalTokenClaims;
}

async function sign(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return encodeBase64Url(new Uint8Array(signature));
}

function encodeBase64Url(value: string | Uint8Array) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeBase64Url(value: string) {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}
```

- [ ] **Step 3: Add action registry tests**

Create `apps/domain/src/domains/agents/actions.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { getAgentActionKind, runAgentAction } from "./actions.js";
import { JobsService } from "../jobs/service.js";

describe("agent action registry", () => {
  it("classifies read, write, and destructive actions", () => {
    expect(getAgentActionKind("ceird.jobs.list")).toBe("read");
    expect(getAgentActionKind("ceird.jobs.add_comment")).toBe("write");
    expect(getAgentActionKind("ceird.jobs.remove_label")).toBe("destructive");
  });

  it.effect(
    "executes destructive actions through the domain service layer",
    () =>
      Effect.gen(function* () {
        const result = yield* runAgentAction({
          input: {
            labelId: "11111111-1111-4111-8111-111111111111",
            workItemId: "22222222-2222-4222-8222-222222222222",
          },
          name: "ceird.jobs.remove_label",
        });

        expect(result).toStrictEqual({ removed: true });
      }).pipe(
        Effect.provideService(JobsService, {
          removeLabel: () => Effect.succeed({ removed: true }),
        } as never)
      )
  );
});
```

- [ ] **Step 4: Add read/write/destructive action registry**

Create `apps/domain/src/domains/agents/actions.ts`:

```ts
import { AgentActionKind, AgentActionName } from "@ceird/agents-core";
import { Effect, Schema } from "effect";

import {
  AddJobCommentInputSchema,
  AssignJobLabelInputSchema,
  WorkItemId,
} from "@ceird/jobs-core";
import { LabelId } from "@ceird/labels-core";
import { JobsService } from "../jobs/service.js";
import { LabelsService } from "../labels/service.js";
import { SitesService } from "../sites/service.js";

export const AGENT_ACTION_KINDS = {
  "ceird.labels.list": "read",
  "ceird.sites.options": "read",
  "ceird.jobs.list": "read",
  "ceird.jobs.detail": "read",
  "ceird.jobs.options": "read",
  "ceird.jobs.add_comment": "write",
  "ceird.jobs.assign_label": "write",
  "ceird.jobs.remove_label": "destructive",
} as const satisfies Record<AgentActionName, AgentActionKind>;

export function getAgentActionKind(name: AgentActionName): AgentActionKind {
  return AGENT_ACTION_KINDS[name];
}

export function runAgentAction(input: {
  readonly name: AgentActionName;
  readonly input: unknown;
}) {
  return Effect.gen(function* () {
    switch (input.name) {
      case "ceird.labels.list":
        return yield* LabelsService.list();
      case "ceird.sites.options":
        return yield* SitesService.getOptions();
      case "ceird.jobs.options":
        return yield* JobsService.getOptions();
      case "ceird.jobs.list":
        return yield* JobsService.list(input.input as never);
      case "ceird.jobs.detail": {
        const decoded = Schema.decodeUnknownSync(
          Schema.Struct({ workItemId: WorkItemId })
        )(input.input);
        return yield* JobsService.getDetail(decoded.workItemId);
      }
      case "ceird.jobs.add_comment": {
        const decoded = Schema.decodeUnknownSync(
          Schema.Struct({
            body: Schema.String,
            workItemId: WorkItemId,
          })
        )(input.input);
        const payload = Schema.decodeUnknownSync(AddJobCommentInputSchema)({
          body: decoded.body,
        });
        return yield* JobsService.addComment(decoded.workItemId, payload);
      }
      case "ceird.jobs.assign_label": {
        const decoded = Schema.decodeUnknownSync(
          Schema.Struct({
            labelId: LabelId,
            workItemId: WorkItemId,
          })
        )(input.input);
        const payload = Schema.decodeUnknownSync(AssignJobLabelInputSchema)({
          labelId: decoded.labelId,
        });
        return yield* JobsService.assignLabel(decoded.workItemId, payload);
      }
      case "ceird.jobs.remove_label": {
        const decoded = Schema.decodeUnknownSync(
          Schema.Struct({
            labelId: LabelId,
            workItemId: WorkItemId,
          })
        )(input.input);
        return yield* JobsService.removeLabel(
          decoded.workItemId,
          decoded.labelId
        );
      }
    }
  });
}
```

- [ ] **Step 5: Add service and HTTP handlers**

Create `apps/domain/src/domains/agents/service.ts` with an Effect service that:

```ts
export class AgentThreadsService extends Effect.Service<AgentThreadsService>()(
  "@ceird/domains/agents/AgentThreadsService",
  {
    accessors: true,
    dependencies: [
      AgentThreadsRepository.Default,
      CurrentOrganizationActor.Default,
    ],
    effect: Effect.gen(function* () {
      const repository = yield* AgentThreadsRepository;
      const actor = yield* CurrentOrganizationActor;

      return {
        list: Effect.gen(function* () {
          const current = yield* actor.get();
          return { items: yield* repository.listForUser(current) };
        }),
        create: (input: CreateAgentThreadInput) =>
          Effect.gen(function* () {
            const current = yield* actor.get();
            const id = makeAgentThreadId();
            const agentInstanceName = buildAgentInstanceName({
              organizationId: current.organizationId,
              threadId: id,
              userId: current.userId,
            });
            const item = yield* repository.create({
              agentInstanceName,
              id,
              organizationId: current.organizationId,
              title: input.title ?? "New thread",
              userId: current.userId,
            });
            return { item };
          }),
        archive: (threadId: AgentThreadId) =>
          Effect.gen(function* () {
            const current = yield* actor.get();
            const item = yield* repository.archive({
              id: threadId,
              organizationId: current.organizationId,
              userId: current.userId,
            });
            if (!item)
              return yield* new AgentThreadNotFoundError({
                message: "Agent thread not found",
              });
            return { item };
          }),
      };
    }),
  }
) {}
```

Then add `authorizeConnect` and `runAction` methods in the same service:

```ts
authorizeConnect: (threadId: AgentThreadId, secret: string) =>
  Effect.gen(function* () {
    const current = yield* actor.get();
    const thread = yield* repository.findActiveById({
      id: threadId,
      organizationId: current.organizationId,
      userId: current.userId,
    });
    if (!thread) return yield* new AgentThreadNotFoundError({ message: "Agent thread not found" });
    const token = yield* Effect.promise(() =>
      signAgentInternalToken(secret, {
        organizationId: current.organizationId,
        threadId,
        userId: current.userId,
      })
    );
    return { agentInstanceName: thread.agentInstanceName, token };
  }),
runAction: (input: RunAgentActionInput, token: string, secret: string) =>
  Effect.gen(function* () {
    const claims = yield* Effect.tryPromise({
      catch: () => new AgentAccessDeniedError({ message: "Invalid agent internal token" }),
      try: () => verifyAgentInternalToken(secret, token),
    });
    if (claims.threadId !== input.threadId) {
      return yield* new AgentAccessDeniedError({ message: "Agent token/thread mismatch" });
    }
    const thread = yield* repository.findActiveById(claims);
    if (!thread) return yield* new AgentThreadNotFoundError({ message: "Agent thread not found" });
    const actionRun = yield* repository.startActionRun({
      actionKind: getAgentActionKind(input.name),
      actionName: input.name,
      id: crypto.randomUUID(),
      input: input.input,
      operationId: input.operationId,
      organizationId: claims.organizationId,
      threadId: claims.threadId,
      userId: claims.userId,
    });

    if (actionRun.replayed && actionRun.item.status === "succeeded") {
      return {
        actionRunId: actionRun.item.id,
        replayed: true,
        result: actionRun.item.result,
      };
    }

    const result = yield* runAgentAction(input).pipe(
      Effect.tapBoth({
        onFailure: (error) =>
          repository.failActionRun({
            error: { message: error instanceof Error ? error.message : String(error) },
            id: actionRun.item.id,
          }),
        onSuccess: (value) =>
          repository.completeActionRun({
            id: actionRun.item.id,
            result: value,
          }),
      })
    );

    return {
      actionRunId: actionRun.item.id,
      replayed: false,
      result,
    };
  })
```

Create `apps/domain/src/domains/agents/http.ts` by following the existing jobs/labels HTTP handler pattern and binding:

- `listAgentThreads` to `AgentThreadsService.list`
- `createAgentThread` to `AgentThreadsService.create`
- `archiveAgentThread` to `AgentThreadsService.archive`
- `authorizeAgentConnect` to `AgentThreadsService.authorizeConnect`
- `runAgentAction` to `AgentThreadsService.runAction`

Read `AGENT_INTERNAL_SECRET` through `Config.string("AGENT_INTERNAL_SECRET")`.

- [ ] **Step 6: Wire the API group into the domain server**

Modify `apps/domain/src/http-api.ts`:

```ts
import {
  AgentInternalApiGroup,
  AgentThreadsApiGroup,
} from "@ceird/agents-core";

export const AppApi = HttpApi.make("CeirdApi")
  .add(SystemApiGroup)
  .add(AgentThreadsApiGroup)
  .add(AgentInternalApiGroup)
  .add(JobsApiGroup)
  .add(RateCardsApiGroup)
  .add(LabelsApiGroup)
  .add(SitesApiGroup)
  .add(ServiceAreasApiGroup);
```

Modify `apps/domain/src/server.ts`:

```ts
import { AgentThreadsHttpLive } from "./domains/agents/http.js";

const makeApiHandlersLive = () =>
  HttpApiBuilder.api(AppApi).pipe(
    Layer.provide(
      Layer.mergeAll(
        SystemLive,
        AgentThreadsHttpLive,
        AuthenticationHttpLive,
        JobsHttpLive,
        LabelsHttpLive,
        SitesHttpLive
      )
    )
  );
```

Modify `apps/domain/src/platform/cloudflare/env.ts`:

```ts
readonly AGENT_INTERNAL_SECRET: string;
```

and add it to `domainWorkerEnvConfigMap`.

- [ ] **Step 7: Run domain tests and commit**

Run:

```bash
pnpm --filter domain test -- src/domains/agents
pnpm --filter domain check-types
```

Expected: PASS.

Commit:

```bash
git add apps/domain/src/domains/agents apps/domain/src/http-api.ts apps/domain/src/server.ts apps/domain/src/platform/cloudflare/env.ts
git commit -m "feat(agents): add domain agent thread service"
```

---

### Task 4: Agent Worker Shell

**Files:**

- Create: `apps/agent/AGENTS.md`
- Create: `apps/agent/README.md`
- Create: `apps/agent/package.json`
- Create: `apps/agent/tsconfig.json`
- Create: `apps/agent/vitest.config.ts`
- Create: `apps/agent/src/platform/cloudflare/env.ts`
- Create: `apps/agent/src/domain-client.ts`
- Create: `apps/agent/src/instance.ts`
- Create: `apps/agent/src/tools.ts`
- Create: `apps/agent/src/ceird-agent.ts`
- Create: `apps/agent/src/worker.ts`
- Create: `apps/agent/src/worker.test.ts`

- [ ] **Step 1: Create package metadata**

Create `apps/agent/package.json`:

```json
{
  "name": "agent",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "check-types": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@ceird/agents-core": "workspace:*",
    "@ceird/domain-core": "workspace:*",
    "@cloudflare/ai-chat": "0.7.1",
    "agents": "0.13.0",
    "ai": "6.0.185",
    "workers-ai-provider": "3.1.14",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260501.1",
    "@effect/vitest": "0.29.0",
    "@types/node": "^25.6.0",
    "typescript": "5.9.2",
    "vitest": "^3.2.4"
  }
}
```

Run:

```bash
pnpm install --lockfile-only
```

Expected: `pnpm-lock.yaml` includes the new Agent Worker dependencies.

- [ ] **Step 2: Add Worker env and domain client**

Create `apps/agent/src/platform/cloudflare/env.ts`:

```ts
/// <reference types="@cloudflare/workers-types" />

import type { DomainServiceBinding } from "@ceird/domain-core";

export interface AgentWorkerBindingRuntimeEnv {
  readonly AI: Ai;
  readonly CeirdAgent: DurableObjectNamespace;
  readonly DOMAIN: DomainServiceBinding;
}

export interface AgentWorkerConfigEnv {
  readonly ALCHEMY_STACK_NAME?: string;
  readonly ALCHEMY_STAGE?: string;
  readonly NODE_ENV?: string;
}

export type AgentWorkerEnv = AgentWorkerBindingRuntimeEnv &
  AgentWorkerConfigEnv;
```

Create `apps/agent/src/domain-client.ts`:

```ts
import type { AgentActionName, AgentThreadId } from "@ceird/agents-core";
import { makeDomainServiceClient } from "@ceird/domain-core";

import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";

export async function authorizeAgentConnect(input: {
  readonly env: AgentWorkerEnv;
  readonly request: Request;
  readonly threadId: string;
}) {
  const domain = makeDomainServiceClient(input.env.DOMAIN);
  const url = new URL(
    `/agent/threads/${input.threadId}/authorize`,
    input.request.url
  );
  const response = await domain.request(
    new Request(url, {
      headers: input.request.headers,
      method: "POST",
    })
  );

  if (!response.ok) {
    return new Response(null, { status: response.status });
  }

  return (await response.json()) as {
    readonly agentInstanceName: string;
    readonly token: string;
  };
}

export async function runDomainAgentAction(input: {
  readonly env: AgentWorkerEnv;
  readonly operationId: string;
  readonly token: string;
  readonly threadId: AgentThreadId;
  readonly name: AgentActionName;
  readonly actionInput: unknown;
}) {
  const domain = makeDomainServiceClient(input.env.DOMAIN);
  const response = await domain.request(
    new Request("https://domain.ceird.internal/agent/internal/actions", {
      body: JSON.stringify({
        input: input.actionInput,
        name: input.name,
        operationId: input.operationId,
        threadId: input.threadId,
      }),
      headers: {
        authorization: `Bearer ${input.token}`,
        "content-type": "application/json",
      },
      method: "POST",
    })
  );

  if (!response.ok) {
    throw new Error(`Domain agent action failed with HTTP ${response.status}`);
  }

  return (await response.json()) as { readonly result: unknown };
}
```

- [ ] **Step 3: Add instance parsing and auth-routed Worker**

Create `apps/agent/src/instance.ts`:

```ts
import { parseAgentInstanceName } from "@ceird/agents-core";

export function readAgentInstanceName(request: Request) {
  const [, agentsPrefix, agentName, instanceName] = new URL(
    request.url
  ).pathname.split("/");

  if (
    agentsPrefix !== "agents" ||
    agentName !== "ceird-agent" ||
    !instanceName
  ) {
    return undefined;
  }

  return decodeURIComponent(instanceName);
}

export function readAgentThreadId(request: Request) {
  const instanceName = readAgentInstanceName(request);
  if (!instanceName) return undefined;
  return parseAgentInstanceName(instanceName).threadId;
}
```

Create `apps/agent/src/worker.ts`:

```ts
import { routeAgentRequest } from "agents";

import { authorizeAgentConnect } from "./domain-client.js";
import { CeirdAgent } from "./ceird-agent.js";
import { readAgentThreadId } from "./instance.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";

export { CeirdAgent };

export default {
  async fetch(request: Request, env: AgentWorkerEnv) {
    if (new URL(request.url).pathname === "/health") {
      return Response.json({
        stackName: env.ALCHEMY_STACK_NAME ?? "local",
        stage: env.ALCHEMY_STAGE ?? "local",
      });
    }

    const threadId = readAgentThreadId(request);
    if (!threadId) {
      return new Response(null, { status: 404 });
    }

    const authorization = await authorizeAgentConnect({
      env,
      request,
      threadId,
    });
    if (authorization instanceof Response) {
      return authorization;
    }

    return (
      (await routeAgentRequest(request, env, {
        props: {
          agentToken: authorization.token,
        },
      })) ?? new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<AgentWorkerEnv>;
```

- [ ] **Step 4: Add AIChatAgent implementation**

Create `apps/agent/src/tools.ts`:

```ts
import type { AgentActionName, AgentThreadId } from "@ceird/agents-core";
import { tool } from "ai";
import { z } from "zod";

import { runDomainAgentAction } from "./domain-client.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";

export function makeCeirdAgentTools(input: {
  readonly env: AgentWorkerEnv;
  readonly threadId: AgentThreadId;
  readonly token: string;
}) {
  const run = (
    name: AgentActionName,
    actionInput: unknown,
    toolCallId: string
  ) =>
    runDomainAgentAction({
      actionInput,
      env: input.env,
      name,
      operationId: `${input.threadId}:${toolCallId}:${name}`,
      threadId: input.threadId,
      token: input.token,
    }).then((response) => response.result);

  return {
    listJobs: tool({
      description: "List jobs in the current Ceird organization.",
      inputSchema: z.object({ limit: z.number().optional() }),
      execute: (args, options) =>
        run("ceird.jobs.list", args, options.toolCallId),
    }),
    getJobOptions: tool({
      description: "Get job workflow options.",
      inputSchema: z.object({}),
      execute: (_args, options) =>
        run("ceird.jobs.options", {}, options.toolCallId),
    }),
    listLabels: tool({
      description: "List labels in the current Ceird organization.",
      inputSchema: z.object({}),
      execute: (_args, options) =>
        run("ceird.labels.list", {}, options.toolCallId),
    }),
    getSiteOptions: tool({
      description: "Get site options in the current Ceird organization.",
      inputSchema: z.object({}),
      execute: (_args, options) =>
        run("ceird.sites.options", {}, options.toolCallId),
    }),
    addJobComment: tool({
      description: "Add a comment to a job.",
      inputSchema: z.object({
        body: z.string().min(1),
        workItemId: z.string().uuid(),
      }),
      execute: (args, options) =>
        run("ceird.jobs.add_comment", args, options.toolCallId),
    }),
    assignJobLabel: tool({
      description: "Assign a label to a job.",
      inputSchema: z.object({
        labelId: z.string().uuid(),
        workItemId: z.string().uuid(),
      }),
      execute: (args, options) =>
        run("ceird.jobs.assign_label", args, options.toolCallId),
    }),
    removeJobLabel: tool({
      description: "Remove a label from a job.",
      inputSchema: z.object({
        labelId: z.string().uuid(),
        workItemId: z.string().uuid(),
      }),
      execute: (args, options) =>
        run("ceird.jobs.remove_label", args, options.toolCallId),
    }),
  };
}
```

Create `apps/agent/src/ceird-agent.ts`:

```ts
import { AIChatAgent } from "@cloudflare/ai-chat";
import { convertToModelMessages, streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";

import { parseAgentInstanceName } from "@ceird/agents-core";
import { makeCeirdAgentTools } from "./tools.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";

export class CeirdAgent extends AIChatAgent<AgentWorkerEnv> {
  static options = { sendIdentityOnConnect: false };
  maxPersistedMessages = 200;
  private agentToken: string | undefined;

  async onStart(props?: { readonly agentToken?: string }) {
    this.agentToken = props?.agentToken;
  }

  async onChatMessage() {
    const token = this.agentToken;
    const parsed = parseAgentInstanceName(this.name);

    if (!token) {
      return new Response("Agent authorization is missing", { status: 401 });
    }

    const workersai = createWorkersAI({ binding: this.env.AI });
    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      system:
        "You are Ceird's operations agent. Use Ceird tools when they help. You may read and update Ceird data through the provided tools. Before a mutating tool call, state the exact intended change in your response context; the server enforces authorization, auditing, and idempotency.",
      messages: await convertToModelMessages(this.messages),
      tools: makeCeirdAgentTools({
        env: this.env,
        threadId: parsed.threadId as never,
        token,
      }),
    });

    return result.toUIMessageStreamResponse();
  }
}
```

- [ ] **Step 5: Add Worker tests**

Create `apps/agent/src/worker.test.ts`:

```ts
import { buildAgentInstanceName } from "@ceird/agents-core";
import { describe, expect, it, vi } from "@effect/vitest";

import worker from "./worker.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";

function makeEnv(authorizeStatus = 200): AgentWorkerEnv {
  return {
    AI: {} as Ai,
    CeirdAgent: {} as DurableObjectNamespace,
    DOMAIN: {
      connect: (() => {
        throw new Error("connect is not used");
      }) as never,
      fetch: vi.fn(() =>
        Promise.resolve(
          Response.json(
            {
              agentInstanceName: "unused",
              token: "token",
            },
            { status: authorizeStatus }
          )
        )
      ) as never,
    },
  };
}

describe("agent worker", () => {
  it("serves health locally", async () => {
    const response = await worker.fetch(
      new Request("https://agent.example.com/health"),
      makeEnv(),
      {} as ExecutionContext
    );
    await expect(response.json()).resolves.toMatchObject({
      stackName: "local",
      stage: "local",
    });
  });

  it("rejects non-agent paths", async () => {
    const response = await worker.fetch(
      new Request("https://agent.example.com/nope"),
      makeEnv(),
      {} as ExecutionContext
    );
    expect(response.status).toBe(404);
  });

  it("extracts org/user/thread instance names before routing", async () => {
    const instance = buildAgentInstanceName({
      organizationId: "org_123",
      threadId: "11111111-1111-4111-8111-111111111111",
      userId: "user_123",
    });
    const response = await worker.fetch(
      new Request(
        `https://agent.example.com/agents/ceird-agent/${encodeURIComponent(instance)}`
      ),
      makeEnv(401),
      {} as ExecutionContext
    );

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
pnpm --filter agent test
pnpm --filter agent check-types
```

Expected: PASS.

Commit:

```bash
git add apps/agent pnpm-lock.yaml
git commit -m "feat(agents): add Cloudflare agent worker"
```

---

### Task 5: Alchemy Wiring

**Files:**

- Modify: `infra/stages.ts`
- Modify: `infra/stages.test.ts`
- Modify: `infra/cloudflare-stack.ts`
- Modify: `infra/cloudflare-stack.test.ts`
- Modify: `alchemy.run.ts`

- [ ] **Step 1: Add stage hostname tests**

Modify `infra/stages.test.ts` to assert:

```ts
expect(config.agentHostname).toBe("agent.dev-cillian.example.com");
expect(config.agentHostname).toBe(
  "agent.codex-alchemy-v2-native-migration.ceird.app"
);
expect(config.agentHostname).toBe("agent.main.ceird.app");
```

- [ ] **Step 2: Add `agentHostname` stage config**

Modify `infra/stages.ts`:

```ts
readonly agentHostname: DomainName;
```

Add defaults beside app/API/MCP hostnames:

```ts
const defaultAgentHostname = `agent.${identity.stageSlug}.${zoneName}`;
const agentHostname =
  yield *
  Config.string("CEIRD_AGENT_HOSTNAME").pipe(
    Config.withDefault(defaultAgentHostname),
    Config.mapOrFail(decodeDomainName)
  );
```

Return `agentHostname` in `InfraStageConfig`.

- [ ] **Step 3: Add Agent Worker bindings and env contracts**

Modify `infra/cloudflare-stack.ts`:

```ts
export type AgentWorkerBindings = {
  readonly AI: Cloudflare.AiGateway;
  readonly CeirdAgent: Cloudflare.DurableObjectNamespaceLike;
  readonly DOMAIN: DomainWorkerResource;
};
```

Add helper functions:

```ts
export function makeAgentWorkerEnv(): AgentWorkerConfiguredEnv {
  return { NODE_ENV: "production" };
}

export function makeAgentWorkerBindings(input: {
  readonly ai: Cloudflare.AiGateway;
  readonly domain: DomainWorkerResource;
}) {
  return {
    AI: input.ai,
    CeirdAgent: Cloudflare.DurableObjectNamespace("CeirdAgent", {
      className: "CeirdAgent",
    }),
    DOMAIN: input.domain,
  } satisfies AgentWorkerBindingProps;
}
```

Add an internal secret:

```ts
const agentInternalSecret =
  yield *
  Alchemy.Random("AgentInternalSecret", {
    bytes: 32,
  });
```

Pass `AGENT_INTERNAL_SECRET` into the domain Worker env and the Agent Worker env.

Create the AI gateway and Worker after `domain`:

```ts
const agentAi =
  yield *
  Cloudflare.AiGateway("AgentAiGateway", {
    id: resourceName(input.config, "agent-ai"),
  });

const agent =
  yield *
  Cloudflare.Worker("Agent", {
    name: resourceName(input.config, "agent"),
    main: "apps/agent/src/worker.ts",
    compatibility: workerCompatibility,
    bindings: makeAgentWorkerBindings({ ai: agentAi, domain }),
    env: {
      ...makeAgentWorkerEnv(),
      AGENT_INTERNAL_SECRET: agentInternalSecret.text,
    },
    domain: input.config.agentHostname,
    observability: {
      enabled: true,
      logs: { enabled: true, invocationLogs: true },
      traces: { enabled: true },
    },
    url: false,
  });
```

Return `agent` and `agentOrigin` from `makeCloudflareStack`, and return `agent: cloudflareStack.agentOrigin` from `alchemy.run.ts`.

- [ ] **Step 4: Lock infra contracts**

Modify `infra/cloudflare-stack.test.ts` to assert:

- Domain env includes `AGENT_INTERNAL_SECRET`.
- Agent Worker bindings are exactly `AI`, `CeirdAgent`, and `DOMAIN`.
- Agent Worker has `main: "apps/agent/src/worker.ts"`.
- Agent Worker uses `domain: config.agentHostname`.
- Stack outputs include `agentOrigin`.

- [ ] **Step 5: Run infra tests and commit**

Run:

```bash
pnpm run test:infra
pnpm run check-types:infra
```

Expected: PASS.

Commit:

```bash
git add infra alchemy.run.ts
git commit -m "feat(agents): wire agent worker infrastructure"
```

---

### Task 6: Architecture Docs And Boundary Guards

**Files:**

- Modify: `README.md`
- Modify: `apps/README.md`
- Modify: `docs/architecture/system-overview.md`
- Modify: `docs/architecture/api.md`
- Modify: `docs/architecture/data-layer.md`
- Modify: `docs/architecture/local-development-and-infra.md`
- Modify: `docs/architecture/packages.md`
- Create: `apps/agent/src/domain-adapter-boundaries.test.ts`

- [ ] **Step 1: Add Agent Worker boundary guard**

Create `apps/agent/src/domain-adapter-boundaries.test.ts` by mirroring the API/MCP adapter boundary tests and asserting `apps/agent/src` does not contain:

```ts
expect(relativeFiles).not.toContain("platform/database/database.ts");
expect(relativeFiles).not.toContain("platform/database/schema.ts");
expect(source).not.toContain("drizzle-orm");
expect(source).not.toContain("@effect/sql");
expect(source).not.toContain("@effect/sql-pg");
expect(source).not.toContain('from "pg"');
```

- [ ] **Step 2: Update docs**

Document these points:

- `apps/agent` is a public Cloudflare Agents SDK adapter over `apps/domain`.
- `apps/domain` owns `agent_threads`, `agent_action_runs`, `AGENT_INTERNAL_SECRET`, token verification, action idempotency, audit records, and action execution.
- Agent instances are named `org:{orgId}:user:{userId}:thread:{threadId}`.
- `apps/agent` has no database binding.
- The first landing supports read, write, and destructive actions through domain-owned authorization and idempotency.
- Client-side chat UI, WhatsApp, generated UI, and optional approval policies are separate future plans.

- [ ] **Step 3: Run docs/boundary checks and commit**

Run:

```bash
pnpm --filter agent test -- src/domain-adapter-boundaries.test.ts
rg -n "api-drizzle|api/drizzle|domains/agents" apps/api infra docs/architecture
```

Expected: tests pass, and `rg` returns no matches.

Commit:

```bash
git add README.md apps/README.md docs/architecture apps/agent/src/domain-adapter-boundaries.test.ts
git commit -m "docs(agents): document agent worker boundary"
```

---

## Final Verification

Run:

```bash
pnpm --filter @ceird/agents-core test
pnpm --filter domain test -- src/domains/agents
pnpm --filter agent test
pnpm run test:infra
pnpm --filter @ceird/agents-core check-types
pnpm --filter domain check-types
pnpm --filter agent check-types
pnpm run check-types:infra
rg -n "api-drizzle|api/drizzle|domains/agents" apps/api infra docs/architecture
```

Expected:

- Shared schemas and instance-name helpers pass.
- Domain thread repository, action-run idempotency, service, HTTP, and action tests pass.
- Agent Worker route/auth/boundary tests pass.
- Infra tests prove Agent Worker, DO namespace, AI binding, and `DOMAIN` service binding are declared by Alchemy.
- Type checks pass for the new packages/apps and infra.
- The stale API-owned agent paths do not appear anywhere.

Do not run `alchemy deploy` or `alchemy destroy` without explicit user approval for the target stage.

## Self-Review

- Spec coverage: This builds the agent-side runtime only, keeps client chat deferred, uses Cloudflare Agents SDK/DOs, uses Alchemy-native wiring, supports read/write/destructive actions immediately, and preserves the Domain Worker as the owner of SQL/action authority, idempotency, and audit.
- Placeholder scan: No placeholder markers remain. Deferred items are explicitly out of scope.
- Type consistency: `AgentThreadId`, `AgentActionOperationId`, `AgentInstanceName`, `AgentThreadsApiGroup`, `AgentInternalApiGroup`, `AgentThreadsService`, `AgentThreadsRepository`, `agent_action_runs`, and `CeirdAgent` are named consistently across tasks.
