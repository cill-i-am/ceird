import { Schema } from "effect";

import {
  AgentActionConfirmationPolicy,
  AgentActionExecutionStatus,
  AgentActionKindSchema,
} from "./action-registry.js";
import type { AgentActionSpec } from "./action-registry.js";
import { jobAgentActions, rateCardAgentActions } from "./actions/jobs.js";
import { labelAgentActions } from "./actions/labels.js";
import { organizationAgentActions } from "./actions/organization.js";
import { serviceAreaAgentActions, siteAgentActions } from "./actions/sites.js";

export const AGENT_ACTIONS = [
  ...labelAgentActions,
  ...siteAgentActions,
  ...serviceAreaAgentActions,
  ...jobAgentActions,
  ...rateCardAgentActions,
  ...organizationAgentActions,
] as const;

type AgentActions = typeof AGENT_ACTIONS;
type AgentAction = AgentActions[number];
type NamesOf<Actions extends readonly AgentActionSpec[]> = {
  readonly [Index in keyof Actions]: Actions[Index] extends AgentActionSpec<
    infer Name
  >
    ? Name
    : never;
};
type NonEmptyReadonlyArray<Value> = readonly [Value, ...Value[]];

function namesOf<const Actions extends readonly AgentActionSpec[]>(
  actions: Actions
): NamesOf<Actions> {
  return actions.map((action) => action.name) as NamesOf<Actions>;
}

function nonEmpty<Value>(
  values: readonly Value[],
  label: string
): NonEmptyReadonlyArray<Value> {
  if (values.length === 0) {
    throw new Error(`${label} must include at least one value`);
  }

  return values as NonEmptyReadonlyArray<Value>;
}

function isExecutableAction(
  action: AgentAction
): action is Extract<AgentAction, { readonly executionStatus: "executable" }> {
  return action.executionStatus === "executable";
}

export const AGENT_ACTION_NAMES = nonEmpty(
  namesOf(AGENT_ACTIONS),
  "AGENT_ACTION_NAMES"
);
export const AgentActionNameSchema = Schema.Literals(AGENT_ACTION_NAMES);
export type AgentActionName = AgentAction["name"];

export const AGENT_EXECUTABLE_ACTIONS =
  AGENT_ACTIONS.filter(isExecutableAction);
export const AGENT_EXECUTABLE_ACTION_NAMES = nonEmpty(
  namesOf(AGENT_EXECUTABLE_ACTIONS),
  "AGENT_EXECUTABLE_ACTION_NAMES"
);
const AGENT_EXECUTABLE_ACTION_NAME_SET: ReadonlySet<AgentActionName> = new Set(
  AGENT_EXECUTABLE_ACTION_NAMES
);
export const ExecutableAgentActionNameSchema = Schema.Literals(
  AGENT_EXECUTABLE_ACTION_NAMES
);
export type ExecutableAgentActionName =
  (typeof AGENT_EXECUTABLE_ACTIONS)[number]["name"];

type AgentActionDefinitions = {
  readonly [Action in AgentAction as Action["name"]]: Action;
};

export type AgentActionDefinition<
  Name extends AgentActionName = AgentActionName,
> = AgentActionDefinitions[Name];

function buildAgentActionDefinitions(
  actions: readonly AgentAction[]
): AgentActionDefinitions {
  const definitions = new Map<AgentActionName, AgentAction>();

  for (const action of actions) {
    if (definitions.has(action.name)) {
      throw new Error(`Duplicate agent action name: ${action.name}`);
    }

    definitions.set(action.name, action);
  }

  return Object.fromEntries(definitions) as AgentActionDefinitions;
}

export const AGENT_ACTION_DEFINITIONS =
  buildAgentActionDefinitions(AGENT_ACTIONS);

export function getAgentActionDefinition<const Name extends AgentActionName>(
  name: Name
): AgentActionDefinition<Name> {
  return AGENT_ACTION_DEFINITIONS[name];
}

export function getAgentActionInputSchema<const Name extends AgentActionName>(
  name: Name
): AgentActionDefinition<Name>["inputSchema"] {
  return getAgentActionDefinition(name).inputSchema;
}

export type AgentActionInput<Name extends AgentActionName> = Schema.Schema.Type<
  ReturnType<typeof getAgentActionInputSchema<Name>>
>;

export function getAgentActionKind(name: AgentActionName): AgentAction["kind"] {
  return getAgentActionDefinition(name).kind;
}

export function isAgentActionExecutable(
  name: AgentActionName
): name is ExecutableAgentActionName {
  return AGENT_EXECUTABLE_ACTION_NAME_SET.has(name);
}

export const AgentActionManifestItemSchema = Schema.Struct({
  confirmationPolicy: AgentActionConfirmationPolicy,
  display: Schema.Struct({
    label: Schema.String,
    summary: Schema.String,
    target: Schema.optional(Schema.String),
  }),
  executionStatus: AgentActionExecutionStatus,
  kind: AgentActionKindSchema,
  modelDescription: Schema.String,
  modelName: Schema.String,
  name: AgentActionNameSchema,
});
export type AgentActionManifestItem = Schema.Schema.Type<
  typeof AgentActionManifestItemSchema
>;

export const AgentActionManifestResponseSchema = Schema.Struct({
  actions: Schema.Array(AgentActionManifestItemSchema),
});
export type AgentActionManifestResponse = Schema.Schema.Type<
  typeof AgentActionManifestResponseSchema
>;

export const AGENT_ACTION_MANIFEST_SCHEMA = AgentActionManifestResponseSchema;

export function projectAgentActionManifest(
  actions: readonly AgentActionSpec<AgentActionName>[]
): AgentActionManifestResponse {
  return {
    actions: actions.map((action) => ({
      confirmationPolicy: action.confirmationPolicy,
      display: action.display,
      executionStatus: action.executionStatus,
      kind: action.kind,
      modelDescription: action.modelDescription,
      modelName: action.modelName,
      name: action.name,
    })),
  };
}

export const AGENT_ACTIONS_MANIFEST = projectAgentActionManifest(AGENT_ACTIONS);
export const AGENT_EXECUTABLE_ACTION_MANIFEST = projectAgentActionManifest(
  AGENT_EXECUTABLE_ACTIONS
);

export function getAgentActionManifest(
  options: { readonly executableOnly?: boolean } = {}
): AgentActionManifestResponse {
  return options.executableOnly === true
    ? AGENT_EXECUTABLE_ACTION_MANIFEST
    : AGENT_ACTIONS_MANIFEST;
}
