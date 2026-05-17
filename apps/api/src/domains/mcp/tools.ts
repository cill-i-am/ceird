/* oxlint-disable eslint/max-classes-per-file */

import {
  AddJobCommentInputSchema,
  AssignJobLabelInputSchema,
  JobListQuerySchema,
  OrganizationActivityQuerySchema,
  WorkItemId,
} from "@ceird/jobs-core";
import { LabelId } from "@ceird/labels-core";
import { Tool, Toolkit } from "@effect/ai";
import { HttpServerRequest } from "@effect/platform";
import { Context, Effect, ParseResult, Schema } from "effect";

import { ConfigurationService } from "../jobs/configuration-service.js";
import { JobsService } from "../jobs/service.js";
import { LabelsService } from "../labels/service.js";
import { SitesService } from "../sites/service.js";

export type McpToolScope = "ceird:admin" | "ceird:read" | "ceird:write";

const McpToolFailureSchema = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
});
type McpToolFailure = Schema.Schema.Type<typeof McpToolFailureSchema>;

const MCP_TOOL_FORBIDDEN_ERROR_TAG =
  "@ceird/domains/mcp/McpToolForbiddenError" as const;
class McpToolForbiddenError extends Schema.TaggedError<McpToolForbiddenError>()(
  MCP_TOOL_FORBIDDEN_ERROR_TAG,
  {
    message: Schema.String,
    requiredScope: Schema.String,
    toolName: Schema.String,
  }
) {}

const MCP_TOOL_VALIDATION_ERROR_TAG =
  "@ceird/domains/mcp/McpToolValidationError" as const;
class McpToolValidationError extends Schema.TaggedError<McpToolValidationError>()(
  MCP_TOOL_VALIDATION_ERROR_TAG,
  {
    details: Schema.String,
    message: Schema.String,
    toolName: Schema.String,
  }
) {}

const MCP_TOOL_EXECUTION_ERROR_TAG =
  "@ceird/domains/mcp/McpToolExecutionError" as const;
class McpToolExecutionError extends Schema.TaggedError<McpToolExecutionError>()(
  MCP_TOOL_EXECUTION_ERROR_TAG,
  {
    cause: Schema.String,
    message: Schema.String,
    toolName: Schema.String,
  }
) {}

export class McpToolRequestRuntime extends Context.Tag("McpToolRequestRuntime")<
  McpToolRequestRuntime,
  {
    readonly scopes: readonly string[];
  }
>() {}

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

const ToolOutputSchema = Schema.Unknown;
const OptionalString = Schema.optional(Schema.String);
const OptionalLimit = Schema.optional(
  Schema.Union(Schema.Number, Schema.String)
);

const LabelsListTool = Tool.make("ceird.labels.list", {
  description: "List labels for the current organization.",
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
    LabelsService,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, true);

const SitesOptionsTool = Tool.make("ceird.sites.options", {
  description: "Get site options for the current organization.",
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
    SitesService,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, true);

const JobsListTool = Tool.make("ceird.jobs.list", {
  description: "List jobs in the current organization.",
  parameters: {
    assigneeId: OptionalString,
    coordinatorId: OptionalString,
    cursor: OptionalString,
    labelId: OptionalString,
    limit: OptionalLimit,
    priority: OptionalString,
    serviceAreaId: OptionalString,
    siteId: OptionalString,
    status: OptionalString,
  },
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
    JobsService,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, true);

const JobsDetailTool = Tool.make("ceird.jobs.detail", {
  description: "Load job detail by work item id.",
  parameters: { workItemId: WorkItemId },
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
    JobsService,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, true);

const JobsOptionsTool = Tool.make("ceird.jobs.options", {
  description: "Get options for jobs workflows.",
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
    JobsService,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, true);

const JobsActivityListTool = Tool.make("ceird.jobs.activity.list", {
  description: "List organization job activity.",
  parameters: {
    actorUserId: OptionalString,
    cursor: OptionalString,
    eventType: OptionalString,
    fromDate: OptionalString,
    jobTitle: OptionalString,
    limit: OptionalLimit,
    toDate: OptionalString,
  },
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
    JobsService,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, true);

const RateCardsListTool = Tool.make("ceird.rate_cards.list", {
  description: "List rate cards for jobs configuration.",
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
    ConfigurationService,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, true);

const JobsAddCommentTool = Tool.make("ceird.jobs.add_comment", {
  description: "Add a comment to a job.",
  parameters: {
    body: Schema.String,
    workItemId: WorkItemId,
  },
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
    JobsService,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, false);

const JobsAssignLabelTool = Tool.make("ceird.jobs.assign_label", {
  description: "Assign a label to a job.",
  parameters: {
    labelId: LabelId,
    workItemId: WorkItemId,
  },
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
    JobsService,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, false);

const JobsRemoveLabelTool = Tool.make("ceird.jobs.remove_label", {
  description: "Remove a label from a job.",
  parameters: {
    labelId: LabelId,
    workItemId: WorkItemId,
  },
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
    JobsService,
  ],
})
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Readonly, false);

export const CeirdMcpToolkit = Toolkit.make(
  LabelsListTool,
  SitesOptionsTool,
  JobsListTool,
  JobsDetailTool,
  JobsOptionsTool,
  JobsActivityListTool,
  RateCardsListTool,
  JobsAddCommentTool,
  JobsAssignLabelTool,
  JobsRemoveLabelTool
);

export const CeirdMcpToolkitLayer = CeirdMcpToolkit.toLayer({
  "ceird.labels.list": () =>
    authorizeAndRun("ceird.labels.list", "ceird:read", () =>
      LabelsService.list()
    ),
  "ceird.sites.options": () =>
    authorizeAndRun("ceird.sites.options", "ceird:read", () =>
      SitesService.getOptions()
    ),
  "ceird.jobs.list": (input) =>
    authorizeAndRun("ceird.jobs.list", "ceird:read", () =>
      decodeWithSchema(
        "ceird.jobs.list",
        JobListQuerySchema,
        normalizeLimit(input)
      ).pipe(Effect.flatMap((query) => JobsService.list(query)))
    ),
  "ceird.jobs.detail": ({ workItemId }) =>
    authorizeAndRun("ceird.jobs.detail", "ceird:read", () =>
      JobsService.getDetail(workItemId)
    ),
  "ceird.jobs.options": () =>
    authorizeAndRun("ceird.jobs.options", "ceird:read", () =>
      JobsService.getOptions()
    ),
  "ceird.jobs.activity.list": (input) =>
    authorizeAndRun("ceird.jobs.activity.list", "ceird:admin", () =>
      decodeWithSchema(
        "ceird.jobs.activity.list",
        OrganizationActivityQuerySchema,
        normalizeLimit(input)
      ).pipe(
        Effect.flatMap((query) => JobsService.listOrganizationActivity(query))
      )
    ),
  "ceird.rate_cards.list": () =>
    authorizeAndRun("ceird.rate_cards.list", "ceird:admin", () =>
      ConfigurationService.listRateCards()
    ),
  "ceird.jobs.add_comment": ({ body, workItemId }) =>
    authorizeAndRun("ceird.jobs.add_comment", "ceird:write", () =>
      decodeWithSchema("ceird.jobs.add_comment", AddJobCommentInputSchema, {
        body,
      }).pipe(
        Effect.flatMap((payload) => JobsService.addComment(workItemId, payload))
      )
    ),
  "ceird.jobs.assign_label": ({ labelId, workItemId }) =>
    authorizeAndRun("ceird.jobs.assign_label", "ceird:write", () =>
      decodeWithSchema("ceird.jobs.assign_label", AssignJobLabelInputSchema, {
        labelId,
      }).pipe(
        Effect.flatMap((payload) =>
          JobsService.assignLabel(workItemId, payload)
        )
      )
    ),
  "ceird.jobs.remove_label": ({ labelId, workItemId }) =>
    authorizeAndRun("ceird.jobs.remove_label", "ceird:write", () =>
      JobsService.removeLabel(workItemId, labelId)
    ),
});

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

function authorizeAndRun<A, E, R>(
  toolName: string,
  requiredScope: McpToolScope,
  buildEffect: () => Effect.Effect<A, E, R>
) {
  return Effect.gen(function* () {
    const runtime = yield* McpToolRequestRuntime;
    yield* Effect.annotateCurrentSpan({
      "mcp.required_scope": requiredScope,
      "mcp.scope_count": runtime.scopes.length,
      "mcp.tool": toolName,
    });

    if (!hasRequiredScope(runtime.scopes, requiredScope)) {
      return yield* new McpToolForbiddenError({
        message: `Forbidden: missing ${requiredScope} scope`,
        requiredScope,
        toolName,
      });
    }

    return yield* buildEffect().pipe(
      Effect.mapError((error) =>
        isMcpToolInternalError(error)
          ? error
          : new McpToolExecutionError({
              cause: formatUnknownError(error),
              message: `Tool execution failed: ${formatUnknownError(error)}`,
              toolName,
            })
      )
    );
  }).pipe(
    Effect.mapError(toMcpToolFailure),
    Effect.withSpan(`McpTool.${toolName}`)
  );
}

function decodeWithSchema<A, I>(
  toolName: string,
  schema: Schema.Schema<A, I>,
  input: unknown
) {
  return Schema.decodeUnknown(schema)(input).pipe(
    Effect.mapError((parseError) => {
      const details = ParseResult.TreeFormatter.formatErrorSync(parseError);

      return new McpToolValidationError({
        details,
        message: `Tool input validation failed: ${details}`,
        toolName,
      });
    })
  );
}

type McpToolInternalError =
  | McpToolExecutionError
  | McpToolForbiddenError
  | McpToolValidationError;

function isMcpToolInternalError(error: unknown): error is McpToolInternalError {
  return (
    error instanceof McpToolExecutionError ||
    error instanceof McpToolForbiddenError ||
    error instanceof McpToolValidationError
  );
}

function toMcpToolFailure(error: McpToolInternalError): McpToolFailure {
  if (error._tag === MCP_TOOL_FORBIDDEN_ERROR_TAG) {
    return {
      code: "FORBIDDEN",
      message: error.message,
    };
  }

  if (error._tag === MCP_TOOL_VALIDATION_ERROR_TAG) {
    return {
      code: "VALIDATION_FAILED",
      message: error.message,
    };
  }

  return {
    code: "TOOL_EXECUTION_FAILED",
    message: error.message,
  };
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return String(error);
}

function normalizeLimit(input: unknown) {
  if (typeof input !== "object" || input === null || !("limit" in input)) {
    return input;
  }

  const { limit } = input as { readonly limit: unknown };
  if (typeof limit !== "number") {
    return input;
  }

  return { ...input, limit: String(limit) };
}
