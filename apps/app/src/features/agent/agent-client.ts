"use client";

import type {
  AgentConnectAuthorization,
  PreparedAgentSession,
  AgentThread,
  AgentThreadId,
  AgentThreadListResponse,
} from "@ceird/agents-core";
import { Effect } from "effect";

import type { AppApiClient } from "#/features/api/app-api-client";
import { runBrowserAppApiRequest } from "#/features/api/app-api-client";

const DEFAULT_AGENT_THREAD_TITLE = "New conversation";

function runBrowserAgentApiClient<Response>(
  operation: string,
  execute: (client: AppApiClient) => Effect.Effect<Response, unknown>
): Promise<Response> {
  return Effect.runPromise(runBrowserAppApiRequest(operation, execute));
}

export function listCurrentAgentThreads(
  limit = 1
): Promise<AgentThreadListResponse> {
  return runBrowserAgentApiClient("AgentClient.listThreads", (client) =>
    client.agentThreads.listAgentThreads({
      query: { limit },
    })
  );
}

export async function createCurrentAgentThread(
  title = DEFAULT_AGENT_THREAD_TITLE
): Promise<AgentThread> {
  const response = await runBrowserAgentApiClient(
    "AgentClient.createThread",
    (client) =>
      client.agentThreads.createAgentThread({
        payload: { title },
      })
  );

  return response.item;
}

export async function ensureCurrentAgentThread(): Promise<AgentThread> {
  const response = await listCurrentAgentThreads(1);
  const existingThread = response.items.at(0);

  if (existingThread) {
    return existingThread;
  }

  return createCurrentAgentThread();
}

export function prepareCurrentAgentSession(
  title = DEFAULT_AGENT_THREAD_TITLE
): Promise<PreparedAgentSession> {
  return runBrowserAgentApiClient("AgentClient.prepareSession", (client) =>
    client.agentThreads.prepareAgentSession({
      payload: { title },
    })
  );
}

export function authorizeCurrentAgentThread(
  threadId: AgentThreadId
): Promise<AgentConnectAuthorization> {
  return runBrowserAgentApiClient("AgentClient.authorizeThread", (client) =>
    client.agentThreads.authorizeAgentConnect({
      params: { threadId },
    })
  );
}
