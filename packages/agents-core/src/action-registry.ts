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

export interface AgentActionSpec<Name extends string = string> {
  readonly name: Name;
  readonly kind: AgentActionKind;
  readonly confirmationPolicy: AgentActionConfirmationPolicy;
  readonly modelName: string;
  readonly modelDescription: string;
  readonly inputSchema: Schema.Schema.Any;
  readonly display: {
    readonly label: string;
    readonly summary: string;
    readonly target?: string;
  };
}

export function defineAgentAction<const Name extends string>(
  spec: AgentActionSpec<Name>
): AgentActionSpec<Name> {
  return spec;
}

export const AgentActionManifestItemSchema = Schema.Struct({
  confirmationPolicy: AgentActionConfirmationPolicy,
  display: Schema.Struct({
    label: Schema.String,
    summary: Schema.String,
    target: Schema.optional(Schema.String),
  }),
  kind: AgentActionKindSchema,
  modelDescription: Schema.String,
  modelName: Schema.String,
  name: Schema.String,
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
