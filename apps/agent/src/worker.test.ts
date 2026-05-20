import { AgentInstanceName, signAgentConnectToken } from "@ceird/agents-core";
import type { DomainServiceBinding } from "@ceird/domain-core";
import { describe, expect, it } from "@effect/vitest";
import type { routeAgentRequest as routeAgentRequestFunction } from "agents";
import { Schema } from "effect";
import { beforeEach, vi } from "vitest";

import type * as CeirdAgentModule from "./ceird-agent.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";

type CeirdAgentConstructor = typeof CeirdAgentModule.CeirdAgent;

const { routeAgentRequest } = vi.hoisted(() => ({
  routeAgentRequest: vi.fn<typeof routeAgentRequestFunction>(),
}));
const MockCeirdAgent = function CeirdAgent() {};

vi.mock(import("agents"), () => ({ routeAgentRequest }));
vi.mock(import("./ceird-agent.js"), () => ({
  CeirdAgent: MockCeirdAgent as unknown as CeirdAgentConstructor,
}));

const decodeAgentInstanceName = Schema.decodeUnknownSync(AgentInstanceName);
const agentInstanceName = decodeAgentInstanceName(
  "org:org_123:user:user_123:thread:11111111-1111-4111-8111-111111111111"
);

describe("Agent Worker adapter", () => {
  beforeEach(() => {
    routeAgentRequest.mockReset();
  });

  it("routes the SDK canonical kebab-case Agent path after authorization", async () => {
    routeAgentRequest.mockResolvedValue(new Response(null, { status: 204 }));
    const env = makeEnv();
    const token = await signAgentConnectToken({
      agentInstanceName,
      secret: "agent-secret",
      ttlSeconds: 60,
    });
    const response = await fetchWorker(
      new Request(makeAgentUrl("ceird-agent", token)),
      env
    );
    const routedRequest = routeAgentRequest.mock.calls[0]?.[0];

    expect(response.status).toBe(204);
    expect(routedRequest).toBeInstanceOf(Request);
    expect(new URL((routedRequest as Request).url).pathname).toContain(
      "/agents/ceird-agent/"
    );
    expect(
      new URL((routedRequest as Request).url).searchParams.has("token")
    ).toBe(false);
  });

  it("does not report Agent routing failures as authorization failures", async () => {
    routeAgentRequest.mockRejectedValue(new Error("durable object down"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const env = makeEnv();
    const token = await signAgentConnectToken({
      agentInstanceName,
      secret: "agent-secret",
      ttlSeconds: 60,
    });
    try {
      const response = await fetchWorker(
        new Request(makeAgentUrl("ceird-agent", token)),
        env
      );

      await expect(response.text()).resolves.toBe("Agent route failed");
      expect(response.status).toBe(500);
      expect(consoleError).toHaveBeenCalledWith(
        "Agent route failed",
        expect.objectContaining({
          cause: "Error",
          path: `/agents/ceird-agent/${encodeURIComponent(agentInstanceName)}`,
        })
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("rejects missing connect tokens as authorization failures", async () => {
    const response = await fetchWorker(
      new Request(
        `https://agent.example.com/agents/ceird-agent/${encodeURIComponent(agentInstanceName)}`
      ),
      makeEnv()
    );

    await expect(response.text()).resolves.toBe("Agent request unauthorized");
    expect(response.status).toBe(401);
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

async function fetchWorker(
  request: Request,
  env: AgentWorkerEnv
): Promise<Response> {
  const { default: worker } = await import("./worker.js");

  return await worker.fetch(request, env);
}
