import {
  AGENT_EXECUTABLE_ACTIONS,
  AgentActionOperationId,
} from "@ceird/agents-core/runtime";
import type {
  AgentActionName,
  AgentInstanceName,
  AgentProximityOriginContextFrame,
  ExecutableAgentActionName,
} from "@ceird/agents-core/runtime";
import { jsonSchema, tool } from "ai";
import type { FlexibleSchema, ToolExecutionOptions, ToolSet } from "ai";
import { Schema } from "effect";

import { runDomainAction } from "./domain-client.js";
import { extractAgentThreadId } from "./instance.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";

const decodeAgentActionOperationId = Schema.decodeUnknownSync(
  AgentActionOperationId
);
interface CeirdToolBlueprint {
  readonly action: ExecutableAgentAction;
  readonly inputSchema: FlexibleSchema<unknown>;
}
const CEIRD_READ_TOOL_BLUEPRINTS = AGENT_EXECUTABLE_ACTIONS.filter(
  (action) => action.kind === "read"
).map(makeToolBlueprint);
const ceirdReadToolBlueprintsByName = new Map(
  CEIRD_READ_TOOL_BLUEPRINTS.map((blueprint) => [
    blueprint.action.name,
    blueprint,
  ])
);
let ceirdMutationToolBlueprints: readonly CeirdToolBlueprint[] | undefined;
let ceirdMutationToolBlueprintsByName:
  | ReadonlyMap<ExecutableAgentActionName, CeirdToolBlueprint>
  | undefined;
const PROXIMITY_ACTION_NAMES = new Set<ExecutableAgentActionName>([
  "ceird.jobs.proximity",
  "ceird.jobs.route_preview",
  "ceird.sites.proximity",
  "ceird.sites.route_preview",
]);

interface CreateCeirdToolsOptions {
  readonly proximityOrigin?:
    | AgentProximityOriginContextFrame["origin"]
    | undefined;
}

type AgentToolModelJson =
  | boolean
  | null
  | number
  | string
  | AgentToolModelJson[]
  | { [key: string]: AgentToolModelJson };

export function createCeirdTools(
  env: AgentWorkerEnv,
  agentInstanceName: AgentInstanceName,
  toolOptions: CreateCeirdToolsOptions = {}
) {
  const threadId = extractAgentThreadId(agentInstanceName);

  const runAction = async (
    name: ExecutableAgentActionName,
    input: unknown,
    executionOptions: ToolExecutionOptions
  ) => {
    const actionInput = applyProximityOriginOverride(
      name,
      input,
      toolOptions.proximityOrigin
    );
    const response = await runDomainAction(env, {
      input: actionInput,
      name,
      operationId: buildOperationId(name, executionOptions.toolCallId),
      threadId,
    });

    return response.result;
  };

  const tools: ToolSet = {};
  const mutationToolsEnabled = env.AGENT_MUTATION_TOOLS_ENABLED === "true";

  for (const { action, inputSchema } of getCeirdToolBlueprints(
    mutationToolsEnabled
  )) {
    const execute = (input: unknown, executionOptions: ToolExecutionOptions) =>
      runAction(action.name, input, executionOptions);
    const baseTool = {
      description: action.modelDescription,
      ...(action.confirmationPolicy === "none" ? {} : { needsApproval: true }),
      execute,
      inputSchema,
    };

    tools[action.modelName] = PROXIMITY_ACTION_NAMES.has(action.name)
      ? tool<unknown, unknown>({
          ...baseTool,
          toModelOutput: proximityToolModelOutput,
        })
      : tool<unknown, unknown>(baseTool);
  }

  return tools;
}

type ExecutableAgentAction = (typeof AGENT_EXECUTABLE_ACTIONS)[number];

function getCeirdToolBlueprints(
  mutationToolsEnabled: boolean
): readonly CeirdToolBlueprint[] {
  if (!mutationToolsEnabled) {
    return CEIRD_READ_TOOL_BLUEPRINTS;
  }

  const mutationToolBlueprints = (ceirdMutationToolBlueprintsByName ??=
    getCeirdMutationToolBlueprintsByName());

  return AGENT_EXECUTABLE_ACTIONS.map((action) =>
    action.kind === "read"
      ? getRequiredToolBlueprint(ceirdReadToolBlueprintsByName, action.name)
      : getRequiredToolBlueprint(mutationToolBlueprints, action.name)
  );
}

function makeToolBlueprint(action: ExecutableAgentAction): CeirdToolBlueprint {
  return {
    action,
    inputSchema: makeToolInputSchema(action),
  };
}

function getCeirdMutationToolBlueprintsByName(): ReadonlyMap<
  ExecutableAgentActionName,
  CeirdToolBlueprint
> {
  ceirdMutationToolBlueprints ??= AGENT_EXECUTABLE_ACTIONS.filter(
    (action) => action.kind !== "read"
  ).map(makeToolBlueprint);

  return new Map(
    ceirdMutationToolBlueprints.map((blueprint) => [
      blueprint.action.name,
      blueprint,
    ])
  );
}

function getRequiredToolBlueprint(
  blueprints: ReadonlyMap<ExecutableAgentActionName, CeirdToolBlueprint>,
  name: ExecutableAgentActionName
): CeirdToolBlueprint {
  const blueprint = blueprints.get(name);

  if (blueprint === undefined) {
    throw new Error(`Missing Ceird tool blueprint for ${name}`);
  }

  return blueprint;
}

function makeToolInputSchema<const Action extends ExecutableAgentAction>(
  action: Action
): FlexibleSchema<unknown> {
  return jsonSchema(
    normalizeJsonSchema(Schema.toJsonSchemaDocument(action.inputSchema).schema)
  );
}

type EffectJsonSchema = ReturnType<
  typeof Schema.toJsonSchemaDocument
>["schema"];

function normalizeJsonSchema(
  schema: EffectJsonSchema
): Parameters<typeof jsonSchema>[0] {
  const objectSchema = schema as {
    readonly properties?: unknown;
    readonly type?: unknown;
  };

  if (
    (objectSchema.type === "object" &&
      (objectSchema.properties === undefined ||
        (isRecord(objectSchema.properties) &&
          Object.keys(objectSchema.properties).length === 0))) ||
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

function applyProximityOriginOverride(
  actionName: ExecutableAgentActionName,
  input: unknown,
  proximityOrigin: AgentProximityOriginContextFrame["origin"] | undefined
): unknown {
  if (
    proximityOrigin === undefined ||
    !PROXIMITY_ACTION_NAMES.has(actionName)
  ) {
    return input;
  }

  return replaceCurrentLocationOrigins(input, proximityOrigin);
}

function replaceCurrentLocationOrigins(
  value: unknown,
  proximityOrigin: AgentProximityOriginContextFrame["origin"]
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      replaceCurrentLocationOrigins(item, proximityOrigin)
    );
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "origin" && isRecord(entry)
        ? proximityOrigin
        : replaceCurrentLocationOrigins(entry, proximityOrigin),
    ])
  );
}

function proximityToolModelOutput(options: { readonly output: unknown }): {
  readonly type: "json";
  readonly value: AgentToolModelJson;
} {
  return {
    type: "json",
    value: redactProximityToolModelOutput(options.output),
  };
}

function redactProximityToolModelOutput(value: unknown): AgentToolModelJson {
  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case "boolean":
    case "number":
    case "string": {
      return value;
    }
    case "object": {
      break;
    }
    default: {
      return null;
    }
  }

  if (Array.isArray(value)) {
    return value.map(redactProximityToolModelOutput);
  }

  if (!isRecord(value)) {
    return null;
  }

  const entries = Object.entries(value).flatMap(([key, entry]) => {
    if (key === "coordinates" || key === "originToken" || key === "routeLine") {
      return [];
    }

    if (key === "origin" && isRecord(entry)) {
      return [[key, redactProximityOriginForModel(entry)] as const];
    }

    return [[key, redactProximityToolModelOutput(entry)] as const];
  });

  return Object.fromEntries(entries);
}

function redactProximityOriginForModel(
  origin: Record<string, unknown>
): AgentToolModelJson {
  const redactedOrigin: Record<string, AgentToolModelJson> = {};

  if (typeof origin.mode === "string") {
    redactedOrigin.mode = origin.mode;
  }

  if (typeof origin.displayText === "string") {
    redactedOrigin.displayText = origin.displayText;
  }

  return redactedOrigin;
}

function isEffectEmptyStructJsonSchema(schema: EffectJsonSchema): boolean {
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
