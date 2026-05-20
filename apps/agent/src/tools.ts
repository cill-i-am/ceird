import {
  AGENT_EXECUTABLE_ACTIONS,
  AgentActionOperationId,
} from "@ceird/agents-core";
import type {
  AgentActionName,
  AgentInstanceName,
  ExecutableAgentActionName,
} from "@ceird/agents-core";
import { jsonSchema, tool } from "ai";
import type { FlexibleSchema, ToolExecutionOptions, ToolSet } from "ai";
import { Schema } from "effect";
import * as JSONSchema from "effect/JSONSchema";

import { runDomainAction } from "./domain-client.js";
import { extractAgentThreadId } from "./instance.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";

const decodeAgentActionOperationId = Schema.decodeUnknownSync(
  AgentActionOperationId
);

export function createCeirdTools(
  env: AgentWorkerEnv,
  agentInstanceName: AgentInstanceName
) {
  const threadId = extractAgentThreadId(agentInstanceName);

  const runAction = async (
    name: ExecutableAgentActionName,
    input: unknown,
    options: ToolExecutionOptions
  ) => {
    const response = await runDomainAction(env, {
      input,
      name,
      operationId: buildOperationId(name, options.toolCallId),
      threadId,
    });

    return response.result;
  };

  const tools: ToolSet = {};
  const mutationToolsEnabled = env.AGENT_MUTATION_TOOLS_ENABLED === "true";

  for (const action of AGENT_EXECUTABLE_ACTIONS) {
    if (action.kind !== "read" && !mutationToolsEnabled) {
      continue;
    }

    tools[action.modelName] = tool({
      description: action.modelDescription,
      inputSchema: makeToolInputSchema(action),
      execute: (input, options) => runAction(action.name, input, options),
    });
  }

  return tools;
}

type ExecutableAgentAction = (typeof AGENT_EXECUTABLE_ACTIONS)[number];

function makeToolInputSchema<const Action extends ExecutableAgentAction>(
  action: Action
): FlexibleSchema<unknown> {
  return jsonSchema(
    normalizeJsonSchema(
      JSONSchema.make(action.inputSchema as Schema.Schema.Any)
    )
  );
}

function normalizeJsonSchema(
  schema: ReturnType<typeof JSONSchema.make>
): Parameters<typeof jsonSchema>[0] {
  const objectSchema = schema as {
    readonly properties?: unknown;
    readonly type?: unknown;
  };

  if (
    (objectSchema.type === "object" &&
      isRecord(objectSchema.properties) &&
      Object.keys(objectSchema.properties).length === 0) ||
    isEffectEmptyStructJsonSchema(schema)
  ) {
    return {
      additionalProperties: false,
      properties: {},
      type: "object",
    };
  }

  return schema as Parameters<typeof jsonSchema>[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEffectEmptyStructJsonSchema(
  schema: ReturnType<typeof JSONSchema.make>
): boolean {
  const maybeEmptyStruct = schema as {
    readonly $id?: unknown;
    readonly anyOf?: unknown;
  };

  return (
    maybeEmptyStruct.$id === "/schemas/%7B%7D" &&
    Array.isArray(maybeEmptyStruct.anyOf)
  );
}

function buildOperationId(
  actionName: AgentActionName,
  toolCallId: string
): AgentActionOperationId {
  const normalizedToolCallId = toolCallId
    .replaceAll(/[^a-zA-Z0-9_.:-]/g, "_")
    .slice(0, 120);
  const raw = `tool:${normalizedToolCallId}:${actionName}`.slice(0, 160);

  return decodeAgentActionOperationId(raw.padEnd(8, "_"));
}
