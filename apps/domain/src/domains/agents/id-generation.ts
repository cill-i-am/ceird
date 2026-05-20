import { AgentActionRunId, AgentThreadId } from "@ceird/agents-core";
import type {
  AgentActionRunId as AgentActionRunIdType,
  AgentThreadId as AgentThreadIdType,
} from "@ceird/agents-core";
import { Schema } from "effect";
import { v7 as uuidv7 } from "uuid";

const decodeAgentThreadId = Schema.decodeUnknownSync(AgentThreadId);
const decodeAgentActionRunId = Schema.decodeUnknownSync(AgentActionRunId);

function generateAgentDomainUuid(): string {
  return uuidv7();
}

export function generateAgentThreadId(): AgentThreadIdType {
  return decodeAgentThreadId(generateAgentDomainUuid());
}

export function generateAgentActionRunId(): AgentActionRunIdType {
  return decodeAgentActionRunId(generateAgentDomainUuid());
}
