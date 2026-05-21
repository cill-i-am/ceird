import {
  AGENT_INTERNAL_ACTIONS_PATH,
  AgentThreadResponseSchema,
  makeAgentInternalThreadActivityPath,
  RunAgentActionResponseSchema,
} from "@ceird/agents-core/runtime";
import type {
  AgentActionOperationId,
  AgentThreadId,
  AgentThreadResponse,
  RunAgentActionInput,
  RunAgentActionResponse,
} from "@ceird/agents-core/runtime";
import { makeDomainServiceClient } from "@ceird/domain-core";
import { Schema } from "effect";

import { DomainActionError } from "./domain-action-error.js";
import { DomainThreadActivityError } from "./domain-thread-activity-error.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";

const decodeRunAgentActionResponse = Schema.decodeUnknownSync(
  RunAgentActionResponseSchema
);
const decodeAgentThreadResponse = Schema.decodeUnknownSync(
  AgentThreadResponseSchema
);
const AGENT_INTERNAL_ORIGIN = "https://agent.ceird.internal";

export interface RunDomainActionInput {
  readonly input: unknown;
  readonly name: RunAgentActionInput["name"];
  readonly operationId: AgentActionOperationId;
  readonly threadId: AgentThreadId;
}

export async function touchAgentThreadActivity(
  env: AgentWorkerEnv,
  threadId: AgentThreadId
): Promise<AgentThreadResponse> {
  const domain = makeDomainServiceClient(env.DOMAIN);
  const response = await domain.request(
    new Request(
      new URL(
        makeAgentInternalThreadActivityPath(threadId),
        AGENT_INTERNAL_ORIGIN
      ).toString(),
      {
        headers: {
          authorization: `Bearer ${env.AGENT_INTERNAL_SECRET}`,
        },
        method: "POST",
      }
    )
  );
  const body = await readJson(
    response,
    (status) =>
      new DomainThreadActivityError(
        `Domain thread activity returned invalid JSON with HTTP ${status}`
      )
  );

  if (!response.ok) {
    throw new DomainThreadActivityError(
      formatDomainError(body, response.status)
    );
  }

  return decodeAgentThreadResponse(body);
}

export async function runDomainAction(
  env: AgentWorkerEnv,
  input: RunDomainActionInput
): Promise<RunAgentActionResponse> {
  const domain = makeDomainServiceClient(env.DOMAIN);
  const response = await domain.request(
    new Request(
      new URL(AGENT_INTERNAL_ACTIONS_PATH, AGENT_INTERNAL_ORIGIN).toString(),
      {
        body: JSON.stringify(input),
        headers: {
          authorization: `Bearer ${env.AGENT_INTERNAL_SECRET}`,
          "content-type": "application/json",
        },
        method: "POST",
      }
    )
  );
  const body = await readJson(
    response,
    (status) =>
      new DomainActionError(
        `Domain action returned invalid JSON with HTTP ${status}`
      )
  );

  if (!response.ok) {
    throw new DomainActionError(formatDomainError(body, response.status));
  }

  return decodeRunAgentActionResponse(body);
}

async function readJson(
  response: Response,
  onInvalidJson: (status: number) => Error
): Promise<unknown> {
  const text = await response.text();

  if (text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw onInvalidJson(response.status);
  }
}

function formatDomainError(body: unknown, status: number): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
  ) {
    return body.message;
  }

  return `Domain action failed with HTTP ${status}`;
}
