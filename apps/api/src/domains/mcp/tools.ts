import {
  AddJobCommentInputSchema,
  AssignJobLabelInputSchema,
  JobListQuerySchema,
  OrganizationActivityQuerySchema,
  WorkItemId,
} from "@ceird/jobs-core";
import { LabelId } from "@ceird/labels-core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect, ParseResult, Schema } from "effect";
import { z } from "zod/v4";

import { ConfigurationService } from "../jobs/configuration-service.js";
import { JobsService } from "../jobs/service.js";
import { LabelsService } from "../labels/service.js";
import { SitesService } from "../sites/service.js";
import type { McpSessionIdentity } from "./actor.js";

export type McpToolScope = "ceird:admin" | "ceird:read" | "ceird:write";

interface McpAuthInfo {
  readonly extra?: {
    readonly sessionId?: unknown;
    readonly subject?: unknown;
  };
  readonly scopes?: readonly string[] | undefined;
}

interface McpToolRegistration {
  readonly name: string;
  readonly requiredScope: McpToolScope;
  readonly isAdminTool: boolean;
}

export const MCP_TOOL_REGISTRATIONS: readonly McpToolRegistration[] = [
  {
    name: "ceird.labels.list",
    requiredScope: "ceird:read",
    isAdminTool: false,
  },
  {
    name: "ceird.sites.options",
    requiredScope: "ceird:read",
    isAdminTool: false,
  },
  { name: "ceird.jobs.list", requiredScope: "ceird:read", isAdminTool: false },
  {
    name: "ceird.jobs.detail",
    requiredScope: "ceird:read",
    isAdminTool: false,
  },
  {
    name: "ceird.jobs.options",
    requiredScope: "ceird:read",
    isAdminTool: false,
  },
  {
    name: "ceird.jobs.activity.list",
    requiredScope: "ceird:admin",
    isAdminTool: true,
  },
  {
    name: "ceird.rate_cards.list",
    requiredScope: "ceird:admin",
    isAdminTool: true,
  },
  {
    name: "ceird.jobs.add_comment",
    requiredScope: "ceird:write",
    isAdminTool: false,
  },
  {
    name: "ceird.jobs.assign_label",
    requiredScope: "ceird:write",
    isAdminTool: false,
  },
  {
    name: "ceird.jobs.remove_label",
    requiredScope: "ceird:write",
    isAdminTool: false,
  },
] as const;

export function hasRequiredScope(
  scopes: readonly string[],
  requiredScope: McpToolScope
) {
  if (scopes.includes("ceird:admin")) {
    return true;
  }

  if (requiredScope === "ceird:admin") {
    return false;
  }

  if (requiredScope === "ceird:write") {
    return scopes.includes("ceird:write");
  }

  return scopes.includes("ceird:read");
}

interface RegisterToolLike {
  registerTool: McpServer["registerTool"];
}

export interface McpToolRuntime {
  readonly runWithMcpSession: <A, E, R>(
    session: McpSessionIdentity,
    effect: Effect.Effect<A, E, R>
  ) => Promise<A>;
}

export function registerMcpTools(
  server: RegisterToolLike,
  runtime: McpToolRuntime
) {
  server.registerTool(
    "ceird.labels.list",
    {
      annotations: { readOnlyHint: true },
      description: "List labels for the current organization.",
    },
    authorizeAndRun("ceird:read", runtime, () => LabelsService.list())
  );

  server.registerTool(
    "ceird.sites.options",
    {
      annotations: { readOnlyHint: true },
      description: "Get site options for the current organization.",
    },
    authorizeAndRun("ceird:read", runtime, () => SitesService.getOptions())
  );

  server.registerTool(
    "ceird.jobs.list",
    {
      annotations: { readOnlyHint: true },
      description: "List jobs in the current organization.",
      inputSchema: {
        assigneeId: z.string().optional(),
        coordinatorId: z.string().optional(),
        cursor: z.string().optional(),
        labelId: z.string().optional(),
        limit: z
          .union([z.number().int().positive().max(100), z.string()])
          .optional(),
        priority: z.string().optional(),
        serviceAreaId: z.string().optional(),
        siteId: z.string().optional(),
        status: z.string().optional(),
      },
    },
    authorizeAndRun("ceird:read", runtime, (input) =>
      decodeWithSchema(JobListQuerySchema, input).pipe(
        Effect.flatMap((query) => JobsService.list(query))
      )
    )
  );

  server.registerTool(
    "ceird.jobs.detail",
    {
      annotations: { readOnlyHint: true },
      description: "Load job detail by work item id.",
      inputSchema: { workItemId: z.string().uuid() },
    },
    authorizeAndRun("ceird:read", runtime, (input) =>
      decodeWithSchema(Schema.Struct({ workItemId: WorkItemId }), input).pipe(
        Effect.flatMap((parsed) => JobsService.getDetail(parsed.workItemId))
      )
    )
  );

  server.registerTool(
    "ceird.jobs.options",
    {
      annotations: { readOnlyHint: true },
      description: "Get options for jobs workflows.",
    },
    authorizeAndRun("ceird:read", runtime, () => JobsService.getOptions())
  );

  server.registerTool(
    "ceird.jobs.activity.list",
    {
      annotations: { destructiveHint: false, readOnlyHint: true },
      description: "List organization job activity.",
      inputSchema: {
        actorUserId: z.string().optional(),
        cursor: z.string().optional(),
        eventType: z.string().optional(),
        fromDate: z.string().optional(),
        jobTitle: z.string().optional(),
        limit: z
          .union([z.number().int().positive().max(100), z.string()])
          .optional(),
        toDate: z.string().optional(),
      },
    },
    authorizeAndRun("ceird:admin", runtime, (input) =>
      decodeWithSchema(OrganizationActivityQuerySchema, input).pipe(
        Effect.flatMap((query) => JobsService.listOrganizationActivity(query))
      )
    )
  );

  server.registerTool(
    "ceird.rate_cards.list",
    {
      annotations: { destructiveHint: false, readOnlyHint: true },
      description: "List rate cards for jobs configuration.",
    },
    authorizeAndRun("ceird:admin", runtime, () =>
      ConfigurationService.listRateCards()
    )
  );

  server.registerTool(
    "ceird.jobs.add_comment",
    {
      annotations: { destructiveHint: false, readOnlyHint: false },
      description: "Add a comment to a job.",
      inputSchema: {
        body: z.string().min(1),
        workItemId: z.string().uuid(),
      },
    },
    authorizeAndRun("ceird:write", runtime, (input) =>
      decodeWithSchema(
        Schema.Struct({ body: Schema.String, workItemId: WorkItemId }),
        input
      ).pipe(
        Effect.flatMap(({ workItemId, body }) =>
          decodeWithSchema(AddJobCommentInputSchema, { body }).pipe(
            Effect.flatMap((payload) =>
              JobsService.addComment(workItemId, payload)
            )
          )
        )
      )
    )
  );

  server.registerTool(
    "ceird.jobs.assign_label",
    {
      annotations: { destructiveHint: false, readOnlyHint: false },
      description: "Assign a label to a job.",
      inputSchema: {
        labelId: z.string().uuid(),
        workItemId: z.string().uuid(),
      },
    },
    authorizeAndRun("ceird:write", runtime, (input) =>
      decodeWithSchema(
        Schema.Struct({ labelId: LabelId, workItemId: WorkItemId }),
        input
      ).pipe(
        Effect.flatMap(({ labelId, workItemId }) =>
          decodeWithSchema(AssignJobLabelInputSchema, { labelId }).pipe(
            Effect.flatMap((payload) =>
              JobsService.assignLabel(workItemId, payload)
            )
          )
        )
      )
    )
  );

  server.registerTool(
    "ceird.jobs.remove_label",
    {
      annotations: { destructiveHint: true, readOnlyHint: false },
      description: "Remove a label from a job.",
      inputSchema: {
        labelId: z.string().uuid(),
        workItemId: z.string().uuid(),
      },
    },
    authorizeAndRun("ceird:write", runtime, (input) =>
      decodeWithSchema(
        Schema.Struct({ labelId: LabelId, workItemId: WorkItemId }),
        input
      ).pipe(
        Effect.flatMap(({ labelId, workItemId }) =>
          JobsService.removeLabel(workItemId, labelId)
        )
      )
    )
  );
}

function authorizeAndRun(
  requiredScope: McpToolScope,
  runtime: McpToolRuntime,
  buildEffect: (input: unknown) => Effect.Effect<unknown, unknown, unknown>
) {
  return async (...args: readonly unknown[]) => {
    const input = args.length === 2 ? args[0] : undefined;
    const extra = args.length === 2 ? args[1] : args[0];
    const authInfo = getAuthInfo(extra);
    const session = getSessionIdentity(authInfo);
    const scopes = authInfo?.scopes ?? [];

    if (session === undefined) {
      return {
        content: [
          {
            text: "Unauthorized: MCP auth session is required",
            type: "text" as const,
          },
        ],
        isError: true,
      };
    }

    if (!hasRequiredScope(scopes, requiredScope)) {
      return {
        content: [
          {
            text: `Forbidden: missing ${requiredScope} scope`,
            type: "text" as const,
          },
        ],
        isError: true,
      };
    }

    try {
      const output = await runtime.runWithMcpSession(
        session,
        buildEffect(input)
      );
      return toSuccessResult(output);
    } catch (error) {
      return {
        content: [
          {
            text: `Tool execution failed: ${formatUnknownError(error)}`,
            type: "text" as const,
          },
        ],
        isError: true,
      };
    }
  };
}

function getAuthInfo(extra: unknown): McpAuthInfo | undefined {
  if (typeof extra !== "object" || extra === null) {
    return undefined;
  }

  if (!("authInfo" in extra)) {
    return undefined;
  }

  const authInfo = extra.authInfo;
  return typeof authInfo === "object" && authInfo !== null
    ? (authInfo as McpAuthInfo)
    : undefined;
}

function getSessionIdentity(
  authInfo: McpAuthInfo | undefined
): McpSessionIdentity | undefined {
  const sessionId = authInfo?.extra?.sessionId;
  const userId = authInfo?.extra?.subject;

  if (typeof sessionId !== "string" || typeof userId !== "string") {
    return undefined;
  }

  if (sessionId.length === 0 || userId.length === 0) {
    return undefined;
  }

  return { sessionId, userId };
}

function decodeWithSchema<A, I>(schema: Schema.Schema<A, I>, input: unknown) {
  return Schema.decodeUnknown(schema)(input).pipe(
    Effect.mapError((parseError) =>
      ParseResult.TreeFormatter.formatErrorSync(parseError)
    )
  );
}

function toSuccessResult(output: unknown) {
  return {
    content: [{ text: JSON.stringify(output), type: "text" as const }],
    structuredContent: output as Record<string, unknown>,
  };
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
