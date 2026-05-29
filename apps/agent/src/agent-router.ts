import type { AgentInstanceName } from "@ceird/agents-core/runtime";
import { Duration, Effect, Schema } from "effect";

import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";

export const AGENT_ROUTE_ERROR_TAG =
  "@ceird/agent/platform/cloudflare/AgentRouteError" as const;

export class AgentRouteError extends Schema.TaggedErrorClass<AgentRouteError>()(
  AGENT_ROUTE_ERROR_TAG,
  {
    agentInstanceName: Schema.String,
    cause: Schema.String,
    message: Schema.String,
    namespace: Schema.String,
    path: Schema.String,
  }
) {}

export async function routeCeirdAgentRequest(
  request: Request,
  env: Pick<AgentWorkerEnv, "CeirdAgent">,
  agentInstanceName: AgentInstanceName
): Promise<Response> {
  const id = env.CeirdAgent.idFromName(agentInstanceName);
  const routedRequest = new Request(request);

  routedRequest.headers.set("x-partykit-namespace", "ceird-agent");
  routedRequest.headers.set("x-partykit-room", agentInstanceName);

  try {
    return await retryDurableObjectFetch(
      () => env.CeirdAgent.get(id).fetch(routedRequest.clone()),
      {
        agentInstanceName,
        namespace: "ceird-agent",
        path: new URL(routedRequest.url).pathname,
      }
    );
  } catch (error) {
    throw new AgentRouteError({
      agentInstanceName,
      cause: sanitizeRouteFailureCause(error),
      message: "Agent Durable Object route failed",
      namespace: "ceird-agent",
      path: new URL(routedRequest.url).pathname,
    });
  }
}

async function retryDurableObjectFetch(
  operation: () => Promise<Response>,
  context: {
    readonly agentInstanceName: string;
    readonly namespace: string;
    readonly path: string;
  }
) {
  const maxAttempts = 3;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableDurableObjectError(error)) {
        throw error;
      }

      await delay(routingRetryDelayMs(attempt));
      await logDurableObjectFetchRetry(context, attempt, maxAttempts);
    }
  }
}

async function logDurableObjectFetchRetry(
  context: {
    readonly agentInstanceName: string;
    readonly namespace: string;
    readonly path: string;
  },
  attempt: number,
  maxAttempts: number
) {
  await Effect.runPromise(
    Effect.logWarning("Retrying Agent Durable Object route").pipe(
      Effect.annotateLogs({
        agentInstanceName: context.agentInstanceName,
        agentNamespace: context.namespace,
        agentRouteAttempt: attempt,
        agentRouteMaxAttempts: maxAttempts,
        "http.path": context.path,
      })
    )
  );
}

function isRetryableDurableObjectError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybeDurableObjectError = error as {
    readonly overloaded?: unknown;
    readonly retryable?: unknown;
  };

  return (
    maybeDurableObjectError.retryable === true &&
    maybeDurableObjectError.overloaded !== true
  );
}

function routingRetryDelayMs(attempt: number) {
  const baseDelayMs = 100;
  const maxDelayMs = 800;
  const upperBoundMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));

  return Math.floor(Math.random() * upperBoundMs);
}

async function delay(ms: number) {
  await Effect.runPromise(Effect.sleep(Duration.millis(ms)));
}

function sanitizeRouteFailureCause(cause: unknown) {
  const raw =
    cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);

  return raw
    .replaceAll(/([?&]token=)[^&\s]+/gi, "$1[redacted]")
    .replaceAll(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]");
}
