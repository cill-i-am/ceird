import { Schema } from "effect";

export const AGENT_ACTION_KINDS = ["read", "write", "destructive"] as const;
export const AgentActionKindSchema = Schema.Literals(AGENT_ACTION_KINDS);
export type AgentActionKind = Schema.Schema.Type<typeof AgentActionKindSchema>;

const AGENT_ACTION_CONFIRMATION_POLICIES = [
  "none",
  "confirm",
  "confirm_destructive",
] as const;
export const AgentActionConfirmationPolicy = Schema.Literals(
  AGENT_ACTION_CONFIRMATION_POLICIES
);
export type AgentActionConfirmationPolicy = Schema.Schema.Type<
  typeof AgentActionConfirmationPolicy
>;

const AGENT_ACTION_EXECUTION_STATUSES = ["executable", "planned"] as const;
export const AgentActionExecutionStatus = Schema.Literals(
  AGENT_ACTION_EXECUTION_STATUSES
);
export type AgentActionExecutionStatus = Schema.Schema.Type<
  typeof AgentActionExecutionStatus
>;

export const EmptyAgentActionInputSchema = Schema.Record(
  Schema.String,
  Schema.Never
);

export interface AgentActionSpec<
  Name extends string = string,
  InputSchema extends Schema.Top = Schema.Top,
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
  const InputSchema extends Schema.Top,
  const ExecutionStatus extends AgentActionExecutionStatus,
>(
  spec: AgentActionSpec<Name, InputSchema, ExecutionStatus>
): AgentActionSpec<Name, InputSchema, ExecutionStatus> {
  return spec;
}
