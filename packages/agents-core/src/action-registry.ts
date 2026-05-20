import { Schema } from "effect";

export const AGENT_ACTION_KINDS = ["read", "write", "destructive"] as const;
export const AgentActionKindSchema = Schema.Literal(...AGENT_ACTION_KINDS);
export type AgentActionKind = Schema.Schema.Type<typeof AgentActionKindSchema>;

export const AgentActionConfirmationPolicy = Schema.Literal(
  "none",
  "confirm",
  "confirm_destructive"
);
export type AgentActionConfirmationPolicy = Schema.Schema.Type<
  typeof AgentActionConfirmationPolicy
>;

export const AgentActionExecutionStatus = Schema.Literal(
  "executable",
  "planned"
);
export type AgentActionExecutionStatus = Schema.Schema.Type<
  typeof AgentActionExecutionStatus
>;

export interface AgentActionSpec<
  Name extends string = string,
  InputSchema extends Schema.Schema.Any = Schema.Schema.Any,
  ExecutionStatus extends AgentActionExecutionStatus =
    AgentActionExecutionStatus,
> {
  readonly name: Name;
  readonly kind: AgentActionKind;
  readonly confirmationPolicy: AgentActionConfirmationPolicy;
  readonly executionStatus: ExecutionStatus;
  readonly modelName: string;
  readonly modelDescription: string;
  readonly inputSchema: InputSchema;
  readonly display: {
    readonly label: string;
    readonly summary: string;
    readonly target?: string;
  };
}

export function defineAgentAction<
  const Name extends string,
  const InputSchema extends Schema.Schema.Any,
  const ExecutionStatus extends AgentActionExecutionStatus,
>(
  spec: AgentActionSpec<Name, InputSchema, ExecutionStatus>
): AgentActionSpec<Name, InputSchema, ExecutionStatus> {
  return spec;
}
