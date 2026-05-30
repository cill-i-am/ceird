import type { ChatRecoveryContext } from "@cloudflare/ai-chat";
import type * as AiChatModule from "@cloudflare/ai-chat";
import { beforeAll, beforeEach, describe, expect, it } from "@effect/vitest";
import type * as AiModule from "ai";
import { vi } from "vitest";
import type * as WorkersAiProviderModule from "workers-ai-provider";

import type { makeCeirdChatRecoveryOptions } from "./ceird-agent-recovery.js";
import type { CeirdAgent as CeirdAgentType } from "./ceird-agent.js";
import type { touchAgentThreadActivity } from "./domain-client.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";
import type { createCeirdTools } from "./tools.js";

type CeirdAgentConstructor = typeof CeirdAgentType;
type MakeCeirdChatRecoveryOptions = typeof makeCeirdChatRecoveryOptions;
type TouchAgentThreadActivity = typeof touchAgentThreadActivity;
type CreateCeirdTools = typeof createCeirdTools;

const {
  MockAIChatAgent,
  mockedConvertToModelMessages,
  mockedCreateCeirdTools,
  mockedCreateWorkersAI,
  mockedMakeCeirdChatRecoveryOptions,
  mockedStreamText,
  mockedToUIMessageStreamResponse,
  mockedTouchAgentThreadActivity,
  mockedWorkersModel,
} = vi.hoisted(() => {
  class MockAIChatAgentBase {
    readonly mockAgentBase = true;
  }

  return {
    MockAIChatAgent: MockAIChatAgentBase,
    mockedConvertToModelMessages:
      vi.fn<typeof AiModule.convertToModelMessages>(),
    mockedCreateCeirdTools: vi.fn<CreateCeirdTools>(() => ({})),
    mockedCreateWorkersAI:
      vi.fn<typeof WorkersAiProviderModule.createWorkersAI>(),
    mockedMakeCeirdChatRecoveryOptions: vi.fn<MakeCeirdChatRecoveryOptions>(),
    mockedStreamText: vi.fn<typeof AiModule.streamText>(),
    mockedToUIMessageStreamResponse: vi.fn<() => Response>(
      () => new Response("agent response")
    ),
    mockedTouchAgentThreadActivity: vi.fn<TouchAgentThreadActivity>(() =>
      Promise.resolve({
        item: {
          agentInstanceName:
            "org:org_123:user:user_123:thread:11111111-1111-4111-8111-111111111111",
          createdAt: "2026-05-29T00:00:00.000Z",
          id: "11111111-1111-4111-8111-111111111111",
          lastMessageAt: null,
          status: "active",
          title: "Test thread",
          updatedAt: "2026-05-29T00:00:00.000Z",
        },
      } as Awaited<ReturnType<TouchAgentThreadActivity>>)
    ),
    mockedWorkersModel:
      vi.fn<
        (
          model: string,
          options?: { readonly sessionAffinity?: string | undefined }
        ) => unknown
      >(),
  };
});

vi.mock(import("@cloudflare/ai-chat"), () => ({
  AIChatAgent: MockAIChatAgent as unknown as typeof AiChatModule.AIChatAgent,
}));

vi.mock(import("ai"), () => ({
  convertToModelMessages:
    mockedConvertToModelMessages as unknown as typeof AiModule.convertToModelMessages,
  stepCountIs: vi.fn<typeof AiModule.stepCountIs>(
    () => (() => false) as ReturnType<typeof AiModule.stepCountIs>
  ),
  streamText: mockedStreamText as unknown as typeof AiModule.streamText,
}));

vi.mock(import("./ceird-agent-recovery.js"), () => ({
  makeCeirdChatRecoveryOptions: mockedMakeCeirdChatRecoveryOptions,
}));

vi.mock(import("./domain-client.js"), () => ({
  touchAgentThreadActivity: mockedTouchAgentThreadActivity,
}));

vi.mock(import("./tools.js"), () => ({
  createCeirdTools: mockedCreateCeirdTools,
}));

vi.mock(import("workers-ai-provider"), () => ({
  createWorkersAI:
    mockedCreateWorkersAI as unknown as typeof WorkersAiProviderModule.createWorkersAI,
}));

describe("CeirdAgent", () => {
  let CeirdAgent: CeirdAgentConstructor;

  beforeAll(async () => {
    ({ CeirdAgent } = await import("./ceird-agent.js"));
  });

  beforeEach(() => {
    mockedConvertToModelMessages.mockReset();
    mockedConvertToModelMessages.mockResolvedValue([]);
    mockedCreateCeirdTools.mockClear();
    mockedCreateWorkersAI.mockReset();
    mockedCreateWorkersAI.mockReturnValue(
      mockedWorkersModel as unknown as ReturnType<
        typeof WorkersAiProviderModule.createWorkersAI
      >
    );
    mockedMakeCeirdChatRecoveryOptions.mockReset();
    mockedStreamText.mockReset();
    mockedStreamText.mockReturnValue({
      toUIMessageStreamResponse: mockedToUIMessageStreamResponse,
    } as unknown as ReturnType<typeof AiModule.streamText>);
    mockedToUIMessageStreamResponse.mockClear();
    mockedTouchAgentThreadActivity.mockClear();
    mockedWorkersModel.mockReset();
    mockedWorkersModel.mockReturnValue({ model: "workers-ai-model" });
  });

  it("enables chat recovery on the Agent class", () => {
    const agent = new CeirdAgent({} as never, {} as never);

    expect(agent.chatRecovery).toBe(true);
  });

  it("delegates chat recovery decisions to the recovery helper", async () => {
    const agent = new CeirdAgent({} as never, {} as never);
    const ctx = {
      createdAt: 1000,
      messages: [],
      partialParts: [],
      partialText: "",
      recoveryData: null,
      requestId: "request-1",
      streamId: "stream-1",
    } satisfies ChatRecoveryContext;
    mockedMakeCeirdChatRecoveryOptions.mockReturnValueOnce({
      continue: false,
    });

    await expect(agent.onChatRecovery(ctx)).resolves.toStrictEqual({
      continue: false,
    });
    expect(mockedMakeCeirdChatRecoveryOptions).toHaveBeenCalledWith(ctx);
  });

  it("passes the Alchemy AI Gateway id to Workers AI", async () => {
    const agent = new CeirdAgent({} as never, {} as never) as CeirdAgentType & {
      env: AgentWorkerEnv;
      messages: readonly unknown[];
      name: string;
      sessionAffinity: string;
    };
    agent.env = {
      AGENT_AI_GATEWAY_ID: "ceird-main-agent-ai",
      AGENT_INTERNAL_SECRET: "agent-secret",
      AI: {} as Ai,
      AUTH_APP_ORIGIN: "https://app.example.com",
      CeirdAgent: {} as DurableObjectNamespace,
      DOMAIN: {} as AgentWorkerEnv["DOMAIN"],
    };
    agent.messages = [];
    agent.name =
      "org:org_123:user:user_123:thread:11111111-1111-4111-8111-111111111111";
    agent.sessionAffinity = "session-affinity";

    const response = await agent.onChatMessage(vi.fn());

    expect(await response.text()).toBe("agent response");
    expect(mockedCreateWorkersAI).toHaveBeenCalledWith({
      binding: agent.env.AI,
      gateway: { id: "ceird-main-agent-ai" },
    });
    expect(mockedWorkersModel).toHaveBeenCalledWith(
      "@cf/zai-org/glm-4.7-flash",
      {
        sessionAffinity: "session-affinity",
      }
    );
  });
});
