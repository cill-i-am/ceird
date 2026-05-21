import type { ChatRecoveryContext } from "@cloudflare/ai-chat";
import { describe, expect, it } from "@effect/vitest";
import { vi } from "vitest";

const { mockedMakeCeirdChatRecoveryOptions } = vi.hoisted(() => ({
  mockedMakeCeirdChatRecoveryOptions: vi.fn(),
}));

vi.mock("@cloudflare/ai-chat", () => ({
  AIChatAgent: class {},
}));

vi.mock("./ceird-agent-recovery.js", () => ({
  makeCeirdChatRecoveryOptions: mockedMakeCeirdChatRecoveryOptions,
}));

import { CeirdAgent } from "./ceird-agent.js";

describe("CeirdAgent", () => {
  it("enables chat recovery on the Agent class", () => {
    const agent = new CeirdAgent({} as never, {} as never);

    expect(agent.chatRecovery).toBe(true);
  });

  it("delegates chat recovery decisions to the recovery helper", async () => {
    const agent = new CeirdAgent({} as never, {} as never);
    const ctx = {
      createdAt: 1_000,
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
