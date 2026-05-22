import type { ChatRecoveryContext } from "@cloudflare/ai-chat";
import type * as AiChatModule from "@cloudflare/ai-chat";
import { beforeAll, describe, expect, it } from "@effect/vitest";
import { vi } from "vitest";

import type { makeCeirdChatRecoveryOptions } from "./ceird-agent-recovery.js";
import type { CeirdAgent as CeirdAgentType } from "./ceird-agent.js";

type CeirdAgentConstructor = typeof CeirdAgentType;
type MakeCeirdChatRecoveryOptions = typeof makeCeirdChatRecoveryOptions;

const { MockAIChatAgent, mockedMakeCeirdChatRecoveryOptions } = vi.hoisted(
  () => {
    class MockAIChatAgentBase {
      readonly mockAgentBase = true;
    }

    return {
      MockAIChatAgent: MockAIChatAgentBase,
      mockedMakeCeirdChatRecoveryOptions: vi.fn<MakeCeirdChatRecoveryOptions>(),
    };
  }
);

vi.mock(import("@cloudflare/ai-chat"), () => ({
  AIChatAgent: MockAIChatAgent as unknown as typeof AiChatModule.AIChatAgent,
}));

vi.mock(import("./ceird-agent-recovery.js"), () => ({
  makeCeirdChatRecoveryOptions: mockedMakeCeirdChatRecoveryOptions,
}));

describe("CeirdAgent", () => {
  let CeirdAgent: CeirdAgentConstructor;

  beforeAll(async () => {
    ({ CeirdAgent } = await import("./ceird-agent.js"));
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
});
