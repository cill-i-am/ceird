import {
  makeAgentProximityOriginContextBody,
  makeAgentProximityOriginContextFrame,
} from "@ceird/agents-core/runtime";
import type { AgentProximityOriginContextFrame } from "@ceird/agents-core/runtime";
import type { ChatRecoveryContext } from "@cloudflare/ai-chat";
import type * as AiChatModule from "@cloudflare/ai-chat";
import { beforeAll, beforeEach, describe, expect, it } from "@effect/vitest";
import type * as AiModule from "ai";
import type { UIMessage } from "ai";
import { vi } from "vitest";
import type * as WorkersAiProviderModule from "workers-ai-provider";

import type { makeCeirdChatRecoveryOptions } from "./ceird-agent-recovery.js";
import type { CeirdAgent as CeirdAgentType } from "./ceird-agent.js";
import type {
  touchAgentThreadActivity,
  validateAgentCurrentLocationAccess,
} from "./domain-client.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";
import type { createCeirdTools } from "./tools.js";

type CeirdAgentConstructor = typeof CeirdAgentType;
type MakeCeirdChatRecoveryOptions = typeof makeCeirdChatRecoveryOptions;
type TouchAgentThreadActivity = typeof touchAgentThreadActivity;
type ValidateAgentCurrentLocationAccess =
  typeof validateAgentCurrentLocationAccess;
type CreateCeirdTools = typeof createCeirdTools;
type TypedAgentOrigin = Extract<
  AgentProximityOriginContextFrame["origin"],
  { readonly mode: "typed_origin" }
>;

const {
  MockAIChatAgent,
  mockedConvertToModelMessages,
  mockedCreateCeirdTools,
  mockedCreateWorkersAI,
  mockedMakeCeirdChatRecoveryOptions,
  mockedStreamText,
  mockedToUIMessageStreamResponse,
  mockedTouchAgentThreadActivity,
  mockedValidateAgentCurrentLocationAccess,
  mockedWorkersModel,
} = vi.hoisted(() => {
  class MockAIChatAgentBase {
    readonly storedStreamChunks: {
      readonly body: string;
      readonly streamId: string;
    }[] = [];
    readonly mockAgentBase = true;
    lastBaseMessage: ArrayBuffer | ArrayBufferView | string | null = null;

    onMessage(
      _connection: unknown,
      message: ArrayBuffer | ArrayBufferView | string
    ) {
      this.lastBaseMessage = message;
      void this.mockAgentBase;
    }

    onChatResponse() {
      void this.mockAgentBase;
    }

    _markStreamError() {
      void this.mockAgentBase;
    }

    _startStream(requestId: string) {
      void this.mockAgentBase;
      return `stream-${requestId}`;
    }

    _storeStreamChunk(streamId: string, body: string) {
      this.storedStreamChunks.push({ body, streamId });
    }
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
    mockedValidateAgentCurrentLocationAccess:
      vi.fn<ValidateAgentCurrentLocationAccess>(() => Promise.resolve()),
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
  validateAgentCurrentLocationAccess: mockedValidateAgentCurrentLocationAccess,
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
    mockedValidateAgentCurrentLocationAccess.mockReset();
    mockedValidateAgentCurrentLocationAccess.mockResolvedValue();
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
      attempt: 1,
      createdAt: 1000,
      incidentId: "incident-1",
      maxAttempts: 3,
      messages: [],
      partialParts: [],
      partialText: "",
      recoveryData: null,
      recoveryKind: "continue",
      recoveryRootRequestId: "request-1",
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
    const agent = makeRunnableAgent(CeirdAgent);

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

  it("adds request-scoped proximity origin guidance to the system prompt", async () => {
    const agent = makeRunnableAgent(CeirdAgent);
    const contextId = "agent-origin-11111111-1111-4111-8111-111111111111";

    await agent.onMessage(
      {} as never,
      JSON.stringify(
        makeAgentProximityOriginContextFrame(contextId, {
          accuracyMeters: 12,
          coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
          mode: "current_location",
        })
      )
    );

    await agent.onChatMessage(vi.fn(), {
      body: makeAgentProximityOriginContextBody(contextId),
      requestId: "request-1",
    });

    expect(mockedStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.not.stringContaining("Request origin data JSON"),
      })
    );
    const streamTextInput = mockedStreamText.mock.calls.at(-1)?.[0] as
      | { readonly system?: string }
      | undefined;
    expect(streamTextInput?.system).not.toContain("53.349805");
    expect(streamTextInput?.system).not.toContain("-6.26031");
    expect(streamTextInput?.system).toContain("hidden route origin");
    expect(streamTextInput?.system).toContain("placeholder coordinates");
    expect(streamTextInput?.system).toContain(
      "Rank by traffic-aware driving time, not straight-line distance"
    );
    expect(mockedCreateCeirdTools).toHaveBeenLastCalledWith(
      agent.env,
      agent.name,
      {
        proximityOrigin: {
          accuracyMeters: 12,
          coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
          mode: "current_location",
        },
      }
    );
    expect(mockedValidateAgentCurrentLocationAccess).toHaveBeenCalledWith(
      agent.env,
      "11111111-1111-4111-8111-111111111111"
    );

    mockedStreamText.mockClear();

    await agent.onChatMessage(vi.fn(), {
      body: makeAgentProximityOriginContextBody(contextId),
      requestId: "request-2",
    });

    expect(mockedStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.not.stringContaining("Request origin data JSON"),
      })
    );
  });

  it("drops request-scoped proximity origins when current-location access validation fails", async () => {
    const agent = makeRunnableAgent(CeirdAgent);
    const contextId = "agent-origin-55555555-5555-4555-8555-555555555555";
    mockedValidateAgentCurrentLocationAccess.mockRejectedValueOnce(
      new Error("Current location access is disabled for this user.")
    );

    await agent.onMessage(
      {} as never,
      JSON.stringify(
        makeAgentProximityOriginContextFrame(contextId, {
          accuracyMeters: 12,
          coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
          mode: "current_location",
        })
      )
    );

    await agent.onChatMessage(vi.fn(), {
      body: makeAgentProximityOriginContextBody(contextId),
      requestId: "request-1",
    });

    expect(mockedValidateAgentCurrentLocationAccess).toHaveBeenCalledWith(
      agent.env,
      "11111111-1111-4111-8111-111111111111"
    );
    expect(mockedStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.not.stringContaining("Request origin data JSON"),
      })
    );
  });

  it("keeps signed typed-origin frames when current-location access is disabled", async () => {
    const agent = makeRunnableAgent(CeirdAgent);
    const contextId = "agent-origin-66666666-6666-4666-8666-666666666666";
    mockedValidateAgentCurrentLocationAccess.mockRejectedValueOnce(
      new Error("Current location access is disabled for this user.")
    );

    await agent.onMessage(
      {} as never,
      JSON.stringify(
        makeAgentProximityOriginContextFrame(contextId, {
          coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
          displayText: "Docklands depot",
          mode: "typed_origin",
          originToken:
            "v1.typedOrigin.testSignature" as TypedAgentOrigin["originToken"],
          placeId: "ChIJdocklandsDepot" as TypedAgentOrigin["placeId"],
        })
      )
    );

    await agent.onChatMessage(vi.fn(), {
      body: makeAgentProximityOriginContextBody(contextId),
      requestId: "request-1",
    });

    expect(mockedValidateAgentCurrentLocationAccess).not.toHaveBeenCalled();
    expect(mockedCreateCeirdTools).toHaveBeenLastCalledWith(
      agent.env,
      agent.name,
      {
        proximityOrigin: {
          coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
          displayText: "Docklands depot",
          mode: "typed_origin",
          originToken: "v1.typedOrigin.testSignature",
          placeId: "ChIJdocklandsDepot",
        },
      }
    );
  });

  it("ignores expired request-scoped proximity origins", async () => {
    const agent = makeRunnableAgent(CeirdAgent);
    const contextId = "agent-origin-22222222-2222-4222-8222-222222222222";
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(1000);

    try {
      await agent.onMessage(
        {} as never,
        JSON.stringify(
          makeAgentProximityOriginContextFrame(contextId, {
            accuracyMeters: 12,
            coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
            mode: "current_location",
          })
        )
      );

      dateNow.mockReturnValue(121_001);

      await agent.onChatMessage(vi.fn(), {
        body: makeAgentProximityOriginContextBody(contextId),
        requestId: "request-1",
      });

      expect(mockedStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.not.stringContaining("Request origin data JSON"),
        })
      );
    } finally {
      dateNow.mockRestore();
    }
  });

  it("strips unsupported chat request body fields before the AI chat runtime handles them", async () => {
    const agent = makeRunnableAgent(CeirdAgent);
    const request = {
      id: "request-1",
      init: {
        body: JSON.stringify({
          ceirdProximityOriginContextId:
            "agent-origin-33333333-3333-4333-8333-333333333333",
          clientTools: [{ name: "clientTool" }],
          leakedOrigin: {
            coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
          },
          messages: [],
          trigger: "submit-message",
        }),
        method: "POST",
      },
      type: "cf_agent_use_chat_request",
    };

    await agent.onMessage({} as never, JSON.stringify(request));

    const forwarded = JSON.parse(
      (agent as unknown as { readonly lastBaseMessage: string }).lastBaseMessage
    ) as typeof request;
    expect(JSON.parse(forwarded.init.body)).toStrictEqual({
      ceirdProximityOriginContextId:
        "agent-origin-33333333-3333-4333-8333-333333333333",
      messages: [],
      trigger: "submit-message",
    });
    expect(forwarded.init.body).not.toContain("53.349805");
  });

  it("drops invalid proximity context ids from chat request bodies before persistence", async () => {
    const agent = makeRunnableAgent(CeirdAgent);
    const request = {
      id: "request-1",
      init: {
        body: JSON.stringify({
          ceirdProximityOriginContextId: "53.349805,-6.26031",
          messages: [],
          trigger: "submit-message",
        }),
        method: "POST",
      },
      type: "cf_agent_use_chat_request",
    };

    await agent.onMessage({} as never, JSON.stringify(request));

    const forwarded = JSON.parse(
      (agent as unknown as { readonly lastBaseMessage: string }).lastBaseMessage
    ) as typeof request;
    expect(JSON.parse(forwarded.init.body)).toStrictEqual({
      messages: [],
      trigger: "submit-message",
    });
    expect(forwarded.init.body).not.toContain("53.349805");
  });

  it("redacts proximity tool stream chunks before stream recovery storage", () => {
    const agent = makeRunnableAgent(CeirdAgent);
    const streamAgent = agent as unknown as CeirdAgentType & {
      _storeStreamChunk: (streamId: string, body: string) => void;
      storedStreamChunks: {
        readonly body: string;
        readonly streamId: string;
      }[];
    };

    streamAgent._storeStreamChunk(
      "stream-1",
      JSON.stringify({
        input: {
          origin: {
            coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
            mode: "current_location",
          },
        },
        toolCallId: "call-1",
        toolName: "rankNearbyJobs",
        type: "tool-input-available",
      })
    );
    streamAgent._storeStreamChunk(
      "stream-1",
      JSON.stringify({
        output: {
          origin: {
            computedAt: "2026-06-06T10:00:00.000Z",
            coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
            displayText: "Current location",
            mode: "current_location",
          },
          routeLine: {
            coordinates: [
              { latitude: 53.349_805, longitude: -6.260_31 },
              { latitude: 53.3498, longitude: -6.2603 },
            ],
            format: "geojson_linestring",
          },
        },
        toolCallId: "call-1",
        type: "tool-output-available",
      })
    );

    const persisted = JSON.stringify(streamAgent.storedStreamChunks);
    expect(persisted).not.toContain("53.349805");
    expect(persisted).toContain("[redacted-proximity-origin]");
    expect(persisted).toContain("[redacted-route-line]");
  });

  it("redacts exact request coordinates from persisted stream chunks and text messages", async () => {
    const agent = makeRunnableAgent(CeirdAgent);
    const contextId = "agent-origin-44444444-4444-4444-8444-444444444444";
    const streamAgent = agent as unknown as CeirdAgentType & {
      _startStream: (requestId: string) => string;
      _storeStreamChunk: (streamId: string, body: string) => void;
      sanitizeMessageForPersistence: (message: UIMessage) => UIMessage;
      storedStreamChunks: {
        readonly body: string;
        readonly streamId: string;
      }[];
    };

    await agent.onMessage(
      {} as never,
      JSON.stringify(
        makeAgentProximityOriginContextFrame(contextId, {
          accuracyMeters: 12,
          coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
          mode: "current_location",
        })
      )
    );
    await agent.onChatMessage(vi.fn(), {
      body: makeAgentProximityOriginContextBody(contextId),
      requestId: "request-1",
    });

    const streamId = streamAgent._startStream("request-1");
    streamAgent._storeStreamChunk(
      streamId,
      JSON.stringify({
        delta: "The current location is 53.349805,-6.26031.",
        type: "text-delta",
      })
    );
    const sanitized = streamAgent.sanitizeMessageForPersistence({
      id: "assistant-message",
      parts: [
        {
          text: "The current location is 53.349805,-6.26031.",
          type: "text",
        },
      ],
      role: "assistant",
    } as unknown as UIMessage);

    expect(JSON.stringify(streamAgent.storedStreamChunks)).not.toContain(
      "53.349805"
    );
    expect(JSON.stringify(sanitized)).not.toContain("53.349805");
    expect(JSON.stringify(sanitized)).toContain(
      "[redacted-proximity-coordinate]"
    );
  });

  it("redacts typed-origin display text from persisted stream chunks and text messages", async () => {
    const agent = makeRunnableAgent(CeirdAgent);
    const contextId = "agent-origin-77777777-7777-4777-8777-777777777777";
    const streamAgent = agent as unknown as CeirdAgentType & {
      _startStream: (requestId: string) => string;
      _storeStreamChunk: (streamId: string, body: string) => void;
      sanitizeMessageForPersistence: (message: UIMessage) => UIMessage;
      storedStreamChunks: {
        readonly body: string;
        readonly streamId: string;
      }[];
    };

    await agent.onMessage(
      {} as never,
      JSON.stringify(
        makeAgentProximityOriginContextFrame(contextId, {
          coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
          displayText: "Docklands depot",
          mode: "typed_origin",
          originToken:
            "v1.typedOrigin.testSignature" as TypedAgentOrigin["originToken"],
          placeId: "ChIJdocklandsDepot" as TypedAgentOrigin["placeId"],
        })
      )
    );
    await agent.onChatMessage(vi.fn(), {
      body: makeAgentProximityOriginContextBody(contextId),
      requestId: "request-1",
    });

    const streamId = streamAgent._startStream("request-1");
    streamAgent._storeStreamChunk(
      streamId,
      JSON.stringify({
        delta: "The route starts at Docklands depot.",
        type: "text-delta",
      })
    );
    const sanitized = streamAgent.sanitizeMessageForPersistence({
      id: "assistant-message",
      parts: [
        {
          text: "The route starts at Docklands depot.",
          type: "text",
        },
      ],
      role: "assistant",
    } as unknown as UIMessage);

    expect(JSON.stringify(streamAgent.storedStreamChunks)).not.toContain(
      "Docklands depot"
    );
    expect(JSON.stringify(sanitized)).not.toContain("Docklands depot");
    expect(JSON.stringify(sanitized)).toContain(
      "[redacted-proximity-coordinate]"
    );
  });

  it("redacts proximity origins before chat messages are persisted", () => {
    const agent = makeRunnableAgent(CeirdAgent);
    const sanitized = (
      agent as unknown as CeirdAgentType & {
        sanitizeMessageForPersistence: (message: UIMessage) => UIMessage;
      }
    ).sanitizeMessageForPersistence({
      id: "assistant-message",
      parts: [
        {
          input: {
            filters: { priority: "urgent" },
            origin: {
              coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
              mode: "current_location",
            },
          },
          output: {
            origin: {
              computedAt: "2026-06-06T10:00:00.000Z",
              coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
              displayText: "Current location",
              mode: "current_location",
            },
            routeLine: {
              coordinates: [
                { latitude: 53.349_805, longitude: -6.260_31 },
                { latitude: 53.3498, longitude: -6.2603 },
              ],
              format: "geojson_linestring",
            },
            rows: [],
          },
          state: "output-available",
          toolName: "rankNearbyJobs",
          type: "tool-rankNearbyJobs",
        },
      ],
      role: "assistant",
    } as unknown as UIMessage);

    expect(JSON.stringify(sanitized)).not.toContain("53.349805");
    expect(JSON.stringify(sanitized)).toContain("[redacted-proximity-origin]");
    expect(JSON.stringify(sanitized)).toContain("[redacted-route-line]");
  });
});

function makeRunnableAgent(CeirdAgent: CeirdAgentConstructor) {
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

  return agent;
}
