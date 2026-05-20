import { AgentActionOperationId } from "@ceird/agents-core";
import type { AgentActionName, AgentInstanceName } from "@ceird/agents-core";
import { tool } from "ai";
import type { ToolExecutionOptions, ToolSet } from "ai";
import { Schema } from "effect";
import { z } from "zod";

import { runDomainAction } from "./domain-client.js";
import { extractAgentThreadId } from "./instance.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";

const decodeAgentActionOperationId = Schema.decodeUnknownSync(
  AgentActionOperationId
);

export function createCeirdTools(
  env: AgentWorkerEnv,
  agentInstanceName: AgentInstanceName
) {
  const threadId = extractAgentThreadId(agentInstanceName);

  const runAction = async (
    name: AgentActionName,
    input: unknown,
    options: ToolExecutionOptions
  ) => {
    const response = await runDomainAction(env, {
      input,
      name,
      operationId: buildOperationId(name, options.toolCallId),
      threadId,
    });

    return response.result;
  };

  const readTools = {
    getJobDetail: tool({
      description: "Get full detail for a Ceird job by ID.",
      inputSchema: z.object({
        workItemId: z.uuid(),
      }),
      execute: (input, options) =>
        runAction("ceird.jobs.detail", input, options),
    }),
    getJobOptions: tool({
      description:
        "List job form options such as members, labels, sites, contacts, and service areas.",
      inputSchema: z.object({}),
      execute: (input, options) =>
        runAction("ceird.jobs.options", input, options),
    }),
    listJobs: tool({
      description:
        "List Ceird jobs, optionally filtered by status or limited in size.",
      inputSchema: z.object({
        limit: z.number().int().positive().max(100).optional(),
        status: z
          .enum([
            "new",
            "triaged",
            "in_progress",
            "blocked",
            "completed",
            "canceled",
          ])
          .optional(),
      }),
      execute: (input, options) =>
        runAction(
          "ceird.jobs.list",
          {
            ...input,
            limit: input.limit === undefined ? undefined : String(input.limit),
          },
          options
        ),
    }),
    listLabels: tool({
      description: "List active Ceird labels for the organization.",
      inputSchema: z.object({}),
      execute: (input, options) =>
        runAction("ceird.labels.list", input, options),
    }),
    listSiteOptions: tool({
      description: "List site options available in the organization.",
      inputSchema: z.object({}),
      execute: (input, options) =>
        runAction("ceird.sites.options", input, options),
    }),
  } satisfies ToolSet;

  if (env.AGENT_MUTATION_TOOLS_ENABLED !== "true") {
    return readTools;
  }

  return {
    ...readTools,
    addJobComment: tool({
      description: "Add a comment to a Ceird job.",
      inputSchema: z.object({
        body: z.string().min(1).max(4000),
        workItemId: z.uuid(),
      }),
      execute: (input, options) =>
        runAction("ceird.jobs.add_comment", input, options),
    }),
    assignJobLabel: tool({
      description: "Assign an existing label to a Ceird job.",
      inputSchema: z.object({
        labelId: z.uuid(),
        workItemId: z.uuid(),
      }),
      execute: (input, options) =>
        runAction("ceird.jobs.assign_label", input, options),
    }),
    removeJobLabel: tool({
      description: "Remove a label from a Ceird job.",
      inputSchema: z.object({
        labelId: z.uuid(),
        workItemId: z.uuid(),
      }),
      execute: (input, options) =>
        runAction("ceird.jobs.remove_label", input, options),
    }),
  } satisfies ToolSet;
}

function buildOperationId(
  actionName: AgentActionName,
  toolCallId: string
): AgentActionOperationId {
  const normalizedToolCallId = toolCallId
    .replaceAll(/[^a-zA-Z0-9_.:-]/g, "_")
    .slice(0, 120);
  const raw = `tool:${normalizedToolCallId}:${actionName}`.slice(0, 160);

  return decodeAgentActionOperationId(raw.padEnd(8, "_"));
}
