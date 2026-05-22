# Agent Managed Fibers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Ceird's in-app agent turns recoverable across Durable Object eviction and line up managed `startFiber()` for later external-channel delivery, without adding an admin surface yet.

**Architecture:** Start with `AIChatAgent`'s built-in `chatRecovery`, because the current product surface is an in-app WebSocket chat drawer and `AIChatAgent` already wraps chat turns in `runFiber()` when recovery is enabled. Keep the Ceird domain action-run ledger as the authority for product write idempotency; fibers protect the agent turn lifecycle, not domain write semantics. Reserve `startFiber()` for future WhatsApp or webhook ingress where durable acceptance, provider retry dedupe, inspection, and cancellation become product requirements.

**Tech Stack:** Cloudflare Agents SDK, `@cloudflare/ai-chat` `AIChatAgent`, Workers AI provider, Vitest, existing Agent Worker tests, docs under `docs/superpowers`.

---

## File Structure

- Modify: `apps/agent/src/ceird-agent.ts`
  - Enable chat recovery and route recovery decisions through a small exported helper.
- Create: `apps/agent/src/ceird-agent-recovery.test.ts`
  - Unit-test the stale recovery policy without constructing a Durable Object instance.
- Modify: `docs/superpowers/specs/2026-05-21-agent-future-enhancements.md`
  - Mark `chatRecovery` as the immediate fiber slot and `startFiber()` as the WhatsApp/external-ingress slot.

## Task 1: Enable Chat Recovery For The In-App Agent

**Files:**

- Modify: `apps/agent/src/ceird-agent.ts`
- Test: `apps/agent/src/ceird-agent-recovery.test.ts`

- [ ] **Step 1: Write the failing recovery-policy test**

Create `apps/agent/src/ceird-agent-recovery.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";

import {
  CEIRD_CHAT_RECOVERY_STALE_AFTER_MS,
  makeCeirdChatRecoveryOptions,
} from "./ceird-agent.js";

describe("CeirdAgent chat recovery", () => {
  it("auto-continues fresh recovered chat turns", () => {
    const now = 1_000_000;

    expect(
      makeCeirdChatRecoveryOptions(
        {
          createdAt: now - CEIRD_CHAT_RECOVERY_STALE_AFTER_MS + 1,
        },
        now
      )
    ).toEqual({});
  });

  it("persists stale partial output without continuing the turn", () => {
    const now = 1_000_000;

    expect(
      makeCeirdChatRecoveryOptions(
        {
          createdAt: now - CEIRD_CHAT_RECOVERY_STALE_AFTER_MS - 1,
        },
        now
      )
    ).toEqual({ continue: false });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --filter agent test -- src/ceird-agent-recovery.test.ts
```

Expected: FAIL because `CEIRD_CHAT_RECOVERY_STALE_AFTER_MS` and `makeCeirdChatRecoveryOptions` are not exported from `ceird-agent.ts`.

- [ ] **Step 3: Add the minimal recovery helper and enable `chatRecovery`**

Modify `apps/agent/src/ceird-agent.ts`:

```ts
import { AgentInstanceName } from "@ceird/agents-core";
import { AIChatAgent } from "@cloudflare/ai-chat";
import type {
  ChatRecoveryContext,
  ChatRecoveryOptions,
} from "@cloudflare/ai-chat";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import type { ToolSet } from "ai";
import { Schema } from "effect";
import { createWorkersAI } from "workers-ai-provider";

import { touchAgentThreadActivity } from "./domain-client.js";
import { extractAgentThreadId } from "./instance.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";
import { createCeirdTools } from "./tools.js";

const DEFAULT_AGENT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const CEIRD_CHAT_RECOVERY_STALE_AFTER_MS = 2 * 60 * 1000;
const decodeAgentInstanceName = Schema.decodeUnknownSync(AgentInstanceName);

export function makeCeirdChatRecoveryOptions(
  ctx: Pick<ChatRecoveryContext, "createdAt">,
  now = Date.now()
): ChatRecoveryOptions {
  return now - ctx.createdAt > CEIRD_CHAT_RECOVERY_STALE_AFTER_MS
    ? { continue: false }
    : {};
}

export class CeirdAgent extends AIChatAgent<AgentWorkerEnv> {
  override chatRecovery = true;
  messageConcurrency = "queue" as const;
  maxPersistedMessages = 200;

  override async onChatRecovery(
    ctx: ChatRecoveryContext
  ): Promise<ChatRecoveryOptions> {
    return makeCeirdChatRecoveryOptions(ctx);
  }

  override async onChatMessage(
    onFinish: Parameters<AIChatAgent["onChatMessage"]>[0]
  ) {
    const workersAI = createWorkersAI({ binding: this.env.AI });
    const agentInstanceName = decodeAgentInstanceName(this.name);
    const threadId = extractAgentThreadId(agentInstanceName);
    const tools: ToolSet = createCeirdTools(this.env, agentInstanceName);
    const [messages] = await Promise.all([
      convertToModelMessages(this.messages),
      touchAgentThreadActivity(this.env, threadId),
    ]);
    const result = streamText({
      model: workersAI(this.env.AGENT_MODEL ?? DEFAULT_AGENT_MODEL, {
        sessionAffinity: this.sessionAffinity,
      }),
      messages,
      onFinish,
      stopWhen: stepCountIs(8),
      system:
        "You are the Ceird agent for this organization. Use tools to inspect and change Ceird data. Prefer precise, reversible steps; summarize action results clearly after tools run.",
      tools,
    });

    return result.toUIMessageStreamResponse();
  }
}
```

- [ ] **Step 4: Run the recovery test and the existing Agent Worker tests**

Run:

```bash
pnpm --filter agent test -- src/ceird-agent-recovery.test.ts src/tools.test.ts src/worker.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run agent type checks**

Run:

```bash
pnpm --filter agent check-types
```

Expected: PASS. If TypeScript rejects the `override chatRecovery = true` field, keep the same behavior and use the exact declaration style accepted by the installed `AIChatAgent` type.

## Task 2: Document The Fiber Boundary

**Files:**

- Modify: `docs/superpowers/specs/2026-05-21-agent-future-enhancements.md`

- [ ] **Step 1: Update the Managed Fibers section**

Add this paragraph after the existing Managed Fibers opening paragraph:

```md
Immediate next slot: enable `AIChatAgent.chatRecovery` on `CeirdAgent`.
That gives the in-app drawer recoverable streaming turns through the SDK's
internal `runFiber()` wrapper. Do not wrap every domain action in a new fiber:
the domain action-run ledger already owns idempotency for product writes.
Use `startFiber()` later for WhatsApp or webhook ingress, where provider
delivery retries need durable acceptance, dedupe by external message ID,
inspection, cancellation, and cleanup.
```

- [ ] **Step 2: Run the docs sanity check**

Run:

```bash
rg -n "Immediate next slot|startFiber|chatRecovery" docs/superpowers/specs/2026-05-21-agent-future-enhancements.md
```

Expected: the new paragraph is present and uses `chatRecovery` for the in-app slot and `startFiber()` for future external ingress.

## Task 3: Define The WhatsApp `startFiber()` Handoff, But Do Not Implement It

**Files:**

- Modify: `docs/superpowers/specs/2026-05-21-agent-future-enhancements.md`

- [ ] **Step 1: Add the external-channel fiber note**

Add this paragraph under `## Future WhatsApp Adapter Pattern`:

```md
When WhatsApp ingress is implemented, wrap inbound delivery handling in
`startFiber("whatsapp-reply", ...)` with an idempotency key derived from the
provider delivery ID. The fiber should stash the external thread ID, Ceird
organization ID, Ceird user ID, agent thread ID, and outbound reply target
before the model turn starts. If delivery is retried, inspect by idempotency key
and return the retained status instead of starting a second visible reply.
```

- [ ] **Step 2: Capture proof requirements for that future work**

Add this checklist after the paragraph:

```md
Proof needed for WhatsApp fibers:

- Unit test duplicate delivery IDs return the retained managed-fiber status.
- Unit test cancellation records an aborted status and the callback checks
  `ctx.signal.aborted` before outbound replies.
- Integration test an interrupted fiber can be resolved through
  `onFiberRecovered()` or a later duplicate delivery.
- Manual Cloudflare proof: start a local stage, accept a delivery, stop the
  worker during reply generation, restart it, and verify recovery or retained
  interrupted status from `inspectFiberByKey()`.
```

- [ ] **Step 3: Run the docs sanity check**

Run:

```bash
rg -n "whatsapp-reply|inspectFiberByKey|duplicate delivery" docs/superpowers/specs/2026-05-21-agent-future-enhancements.md
```

Expected: the WhatsApp handoff note and proof requirements are present.

## Verification

Run before handing off:

```bash
pnpm --filter agent test -- src/ceird-agent-recovery.test.ts src/tools.test.ts src/worker.test.ts
pnpm --filter agent check-types
pnpm format
```

Do not run `pnpm dev`, `pnpm alchemy dev`, `pnpm alchemy deploy`, or `pnpm alchemy destroy` unless the target stage and credentials are explicitly confirmed.

## Self-Review

- Spec coverage: the plan covers the immediate in-app recovery slot and documents the future WhatsApp managed-fiber boundary.
- Placeholder scan: no placeholder tasks, TODO markers, or "fill this in" steps remain.
- Type consistency: `ChatRecoveryContext`, `ChatRecoveryOptions`, `chatRecovery`, `startFiber()`, and `inspectFiberByKey()` names match the Cloudflare Agents and `@cloudflare/ai-chat` APIs used by the current dependency set.
