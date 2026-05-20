import { AgentActionOperationId, AgentThreadId } from "@ceird/agents-core";
import type { DomainServiceBinding } from "@ceird/domain-core";
import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import { DomainActionError } from "./domain-action-error.js";
import { runDomainAction, touchAgentThreadActivity } from "./domain-client.js";
import { DomainThreadActivityError } from "./domain-thread-activity-error.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";

const decodeAgentThreadId = Schema.decodeUnknownSync(AgentThreadId);
const decodeAgentActionOperationId = Schema.decodeUnknownSync(
  AgentActionOperationId
);

describe("domain action client", () => {
  it("calls the Domain binding with internal authorization", async () => {
    const requests: Request[] = [];
    const env = makeEnv((request) => {
      requests.push(
        request instanceof Request ? request : new Request(request)
      );

      return Promise.resolve(
        Response.json({
          actionRunId: "33333333-3333-4333-8333-333333333333",
          replayed: false,
          result: { labels: [] },
        })
      );
    });
    const response = await runDomainAction(env, {
      input: {},
      name: "ceird.labels.list",
      operationId: decodeAgentActionOperationId("tool-call:1"),
      threadId: decodeAgentThreadId("11111111-1111-4111-8111-111111111111"),
    });

    expect(requests[0]?.headers.get("authorization")).toBe(
      "Bearer agent-secret"
    );
    expect(response.result).toStrictEqual({ labels: [] });
  });

  it("surfaces non-2xx domain responses", async () => {
    const env = makeEnv(() =>
      Promise.resolve(Response.json({ message: "Denied" }, { status: 403 }))
    );

    await expect(
      runDomainAction(env, {
        input: {},
        name: "ceird.labels.list",
        operationId: decodeAgentActionOperationId("tool-call:2"),
        threadId: decodeAgentThreadId("11111111-1111-4111-8111-111111111111"),
      })
    ).rejects.toThrow(DomainActionError);
  });

  it("wraps invalid domain action JSON", async () => {
    const env = makeEnv(() =>
      Promise.resolve(
        new Response("not-json", {
          headers: { "content-type": "application/json" },
        })
      )
    );

    await expect(
      runDomainAction(env, {
        input: {},
        name: "ceird.labels.list",
        operationId: decodeAgentActionOperationId("tool-call:3"),
        threadId: decodeAgentThreadId("11111111-1111-4111-8111-111111111111"),
      })
    ).rejects.toThrow(DomainActionError);
  });

  it("touches thread activity through the Domain binding", async () => {
    const requests: Request[] = [];
    const threadId = decodeAgentThreadId(
      "11111111-1111-4111-8111-111111111111"
    );
    const env = makeEnv((request) => {
      requests.push(
        request instanceof Request ? request : new Request(request)
      );

      return Promise.resolve(
        Response.json({
          item: {
            agentInstanceName:
              "org:org_123:user:user_123:thread:11111111-1111-4111-8111-111111111111",
            createdAt: "2026-05-18T10:00:00.000Z",
            id: threadId,
            lastMessageAt: "2026-05-19T10:00:00.000Z",
            status: "active",
            title: "New thread",
            updatedAt: "2026-05-19T10:00:00.000Z",
          },
        })
      );
    });
    const response = await touchAgentThreadActivity(env, threadId);

    expect(requests[0]?.method).toBe("POST");
    expect(new URL(requests[0]?.url ?? "").pathname).toBe(
      "/agent/internal/threads/11111111-1111-4111-8111-111111111111/activity"
    );
    expect(requests[0]?.headers.get("authorization")).toBe(
      "Bearer agent-secret"
    );
    expect(response.item.lastMessageAt).toBe("2026-05-19T10:00:00.000Z");
  });

  it("surfaces failed thread activity touches", async () => {
    const env = makeEnv(() =>
      Promise.resolve(Response.json({ message: "Missing" }, { status: 404 }))
    );

    await expect(
      touchAgentThreadActivity(
        env,
        decodeAgentThreadId("11111111-1111-4111-8111-111111111111")
      )
    ).rejects.toThrow(DomainThreadActivityError);
  });

  it("wraps invalid thread activity JSON", async () => {
    const env = makeEnv(() => Promise.resolve(new Response("not-json")));

    await expect(
      touchAgentThreadActivity(
        env,
        decodeAgentThreadId("11111111-1111-4111-8111-111111111111")
      )
    ).rejects.toThrow(DomainThreadActivityError);
  });
});

function makeEnv(fetch: DomainServiceBinding["fetch"]): AgentWorkerEnv {
  return {
    AGENT_INTERNAL_SECRET: "agent-secret",
    AI: {} as Ai,
    CeirdAgent: {} as DurableObjectNamespace,
    DOMAIN: { fetch } as DomainServiceBinding,
  };
}
