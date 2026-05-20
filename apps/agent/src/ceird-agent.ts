import { AgentInstanceName } from "@ceird/agents-core";
import { AIChatAgent } from "@cloudflare/ai-chat";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import type { ToolSet } from "ai";
import { Schema } from "effect";
import { createWorkersAI } from "workers-ai-provider";

import { touchAgentThreadActivity } from "./domain-client.js";
import { extractAgentThreadId } from "./instance.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";
import { createCeirdTools } from "./tools.js";

const DEFAULT_AGENT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const decodeAgentInstanceName = Schema.decodeUnknownSync(AgentInstanceName);

export class CeirdAgent extends AIChatAgent<AgentWorkerEnv> {
  messageConcurrency = "queue" as const;
  maxPersistedMessages = 200;

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
