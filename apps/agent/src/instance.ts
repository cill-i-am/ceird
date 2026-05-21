import {
  AgentConnectTokenInvalidError,
  AgentInstanceName,
  parseAgentInstanceName,
  verifyAgentConnectToken,
} from "@ceird/agents-core/runtime";
import type {
  AgentInstanceName as AgentInstanceNameType,
  AgentThreadId,
} from "@ceird/agents-core/runtime";
import { Schema } from "effect";

import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";

const decodeAgentInstanceName = Schema.decodeUnknownSync(AgentInstanceName);

export interface AuthorizedAgentRequest {
  readonly agentInstanceName: AgentInstanceNameType;
  readonly request: Request;
}

export class AgentRequestUnauthorizedError extends Error {
  override readonly name = "AgentRequestUnauthorizedError";
}

export async function authorizeAgentRequest(
  request: Request,
  env: AgentWorkerEnv
): Promise<AuthorizedAgentRequest> {
  const url = new URL(request.url);
  const agentInstanceName = extractAgentInstanceName(url);
  const token = extractBearerToken(request) ?? url.searchParams.get("token");

  if (token === null || token === undefined) {
    throw new AgentRequestUnauthorizedError(
      "Missing agent authorization token"
    );
  }

  try {
    const tokenAgentInstanceName = await verifyAgentConnectToken({
      secret: env.AGENT_INTERNAL_SECRET,
      token,
    });

    if (tokenAgentInstanceName !== agentInstanceName) {
      throw new AgentRequestUnauthorizedError(
        "Agent token does not match route"
      );
    }
  } catch (error) {
    if (error instanceof AgentRequestUnauthorizedError) {
      throw error;
    }

    if (error instanceof AgentConnectTokenInvalidError) {
      throw new AgentRequestUnauthorizedError(error.message);
    }

    throw error;
  }

  return {
    agentInstanceName,
    request: prepareAgentRouteRequest(request),
  };
}

export function extractAgentThreadId(
  agentInstanceName: AgentInstanceNameType
): AgentThreadId {
  decodeAgentInstanceName(agentInstanceName);

  return parseAgentInstanceName(agentInstanceName).threadId;
}

function extractAgentInstanceName(url: URL): AgentInstanceNameType {
  const segments = url.pathname.split("/").filter(Boolean);

  if (
    segments[0] !== "agents" ||
    (segments[1] !== "ceird-agent" && segments[1] !== "CeirdAgent")
  ) {
    throw new AgentRequestUnauthorizedError("Unsupported agent route");
  }

  const encodedName = segments.at(2);

  if (encodedName === undefined) {
    throw new AgentRequestUnauthorizedError("Missing agent instance name");
  }

  try {
    return decodeAgentInstanceName(decodeURIComponent(encodedName));
  } catch {
    throw new AgentRequestUnauthorizedError("Invalid agent instance name");
  }
}

function extractBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  const prefix = "Bearer ";

  return authorization?.startsWith(prefix)
    ? authorization.slice(prefix.length)
    : undefined;
}

function prepareAgentRouteRequest(request: Request): Request {
  const normalizedUrl = request.url.replace(
    "/agents/CeirdAgent/",
    "/agents/ceird-agent/"
  );
  const url = new URL(normalizedUrl);
  url.searchParams.delete("token");
  const sanitizedRequest = new Request(url, request);
  sanitizedRequest.headers.delete("authorization");

  return sanitizedRequest;
}
