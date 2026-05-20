import { AgentInstanceName, signAgentConnectToken } from "@ceird/agents-core";
import type { DomainServiceBinding } from "@ceird/domain-core";
import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  AgentRequestUnauthorizedError,
  authorizeAgentRequest,
  extractAgentThreadId,
} from "./instance.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";

const decodeAgentInstanceName = Schema.decodeUnknownSync(AgentInstanceName);
const agentInstanceName = decodeAgentInstanceName(
  "org:org_123:user:user_123:thread:11111111-1111-4111-8111-111111111111"
);

describe("agent request authorization", () => {
  it("accepts a token matching the route instance name", async () => {
    const token = await signAgentConnectToken({
      agentInstanceName,
      secret: "agent-secret",
      ttlSeconds: 60,
    });
    const request = new Request(makeAgentUrl("ceird-agent", token), {
      headers: { authorization: `Bearer ${token}` },
    });
    const authorized = await authorizeAgentRequest(request, makeEnv());

    expect(authorized.agentInstanceName).toBe(agentInstanceName);
    expect(
      new URL(authorized.request.url).searchParams.has("token")
    ).toBeFalsy();
    expect(new URL(authorized.request.url).pathname).toContain(
      "/agents/ceird-agent/"
    );
    expect(authorized.request.headers.get("authorization")).toBeNull();
    expect(extractAgentThreadId(agentInstanceName)).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("normalizes legacy CamelCase routes before handing off to the Agents SDK", async () => {
    const token = await signAgentConnectToken({
      agentInstanceName,
      secret: "agent-secret",
      ttlSeconds: 60,
    });
    const authorized = await authorizeAgentRequest(
      new Request(makeAgentUrl("CeirdAgent", token)),
      makeEnv()
    );

    expect(new URL(authorized.request.url).pathname).toContain(
      "/agents/ceird-agent/"
    );
  });

  it("rejects tokens for a different instance", async () => {
    const otherAgentInstanceName = decodeAgentInstanceName(
      "org:org_123:user:user_123:thread:22222222-2222-4222-8222-222222222222"
    );
    const token = await signAgentConnectToken({
      agentInstanceName: otherAgentInstanceName,
      secret: "agent-secret",
      ttlSeconds: 60,
    });
    const request = new Request(
      `https://agent.example.com/agents/CeirdAgent/${encodeURIComponent(agentInstanceName)}`,
      {
        headers: { authorization: `Bearer ${token}` },
      }
    );

    await expect(
      authorizeAgentRequest(request, makeEnv())
    ).rejects.toBeInstanceOf(AgentRequestUnauthorizedError);
  });

  it("rejects malformed encoded instance names as authorization failures", async () => {
    await expect(
      authorizeAgentRequest(
        new Request("https://agent.example.com/agents/ceird-agent/%E0%A4%A"),
        makeEnv()
      )
    ).rejects.toBeInstanceOf(AgentRequestUnauthorizedError);
  });
});

function makeAgentUrl(routeName: "CeirdAgent" | "ceird-agent", token: string) {
  return `https://agent.example.com/agents/${routeName}/${encodeURIComponent(agentInstanceName)}?token=${token}`;
}

function makeEnv(): AgentWorkerEnv {
  return {
    AGENT_INTERNAL_SECRET: "agent-secret",
    AI: {} as Ai,
    CeirdAgent: {} as DurableObjectNamespace,
    DOMAIN: {} as DomainServiceBinding,
  };
}
