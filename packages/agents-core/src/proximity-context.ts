import { ProximityOriginInputSchema } from "@ceird/proximity-core/dto";
import type { ProximityOriginInput } from "@ceird/proximity-core/dto";
import { Option, Schema } from "effect";

export const AGENT_PROXIMITY_ORIGIN_CONTEXT_MESSAGE_TYPE =
  "ceird.agent.proximity_origin_context";
export const AGENT_PROXIMITY_ORIGIN_CONTEXT_ID_BODY_KEY =
  "ceirdProximityOriginContextId";
const AGENT_PROXIMITY_ORIGIN_CONTEXT_ID_PATTERN =
  /^agent-origin-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const AgentProximityOriginContextId = Schema.String.pipe(
  Schema.check(Schema.isPattern(AGENT_PROXIMITY_ORIGIN_CONTEXT_ID_PATTERN))
);
export type AgentProximityOriginContextId = Schema.Schema.Type<
  typeof AgentProximityOriginContextId
>;

export const AgentProximityOriginContextFrameSchema = Schema.Struct({
  contextId: AgentProximityOriginContextId,
  origin: ProximityOriginInputSchema,
  type: Schema.Literal(AGENT_PROXIMITY_ORIGIN_CONTEXT_MESSAGE_TYPE),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type AgentProximityOriginContextFrame = Schema.Schema.Type<
  typeof AgentProximityOriginContextFrameSchema
>;

const decodeProximityOriginContextId = Schema.decodeUnknownOption(
  AgentProximityOriginContextId
);
const decodeProximityOriginContextFrame = Schema.decodeUnknownOption(
  AgentProximityOriginContextFrameSchema
);

export function makeAgentProximityOriginContextBody(
  contextId: AgentProximityOriginContextId
) {
  return { [AGENT_PROXIMITY_ORIGIN_CONTEXT_ID_BODY_KEY]: contextId };
}

export function makeAgentProximityOriginContextFrame(
  contextId: AgentProximityOriginContextId,
  origin: ProximityOriginInput
): AgentProximityOriginContextFrame {
  return {
    contextId,
    origin,
    type: AGENT_PROXIMITY_ORIGIN_CONTEXT_MESSAGE_TYPE,
  };
}

export function readAgentProximityOriginContextIdFromBody(
  body: Record<string, unknown> | undefined
): Option.Option<AgentProximityOriginContextId> {
  if (body === undefined) {
    return Option.none();
  }

  return decodeProximityOriginContextId(
    body[AGENT_PROXIMITY_ORIGIN_CONTEXT_ID_BODY_KEY]
  );
}

export function readAgentProximityOriginContextFrame(
  message: unknown
): Option.Option<AgentProximityOriginContextFrame> {
  return decodeProximityOriginContextFrame(message);
}
