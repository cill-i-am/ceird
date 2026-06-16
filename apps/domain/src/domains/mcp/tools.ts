/* oxlint-disable eslint/max-classes-per-file */

import { UserId } from "@ceird/identity-core";
import {
  AddJobCommentInputSchema,
  AssignJobLabelInputSchema,
  JobListQuerySchema,
  OrganizationActivityQuerySchema,
  WorkItemId,
} from "@ceird/jobs-core";
import { LabelId } from "@ceird/labels-core";
import { SiteId } from "@ceird/sites-core";
import { Context, Effect, Schema } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";
import { HttpServerRequest } from "effect/unstable/http";
import type { SqlClient } from "effect/unstable/sql";

import type { DomainDrizzleService } from "../../platform/database/database.js";
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
class McpToolForbiddenError extends Schema.TaggedErrorClass<McpToolForbiddenError>()(
  MCP_TOOL_FORBIDDEN_ERROR_TAG,
  {
    message: Schema.String,
    requiredScope: Schema.String,
    toolName: Schema.String,
  }
) {}

const MCP_TOOL_VALIDATION_ERROR_TAG =
  "@ceird/domains/mcp/McpToolValidationError" as const;
class McpToolValidationError extends Schema.TaggedErrorClass<McpToolValidationError>()(
  MCP_TOOL_VALIDATION_ERROR_TAG,
  {
    details: Schema.String,
    message: Schema.String,
    toolName: Schema.String,
  }
) {}

const MCP_TOOL_EXECUTION_ERROR_TAG =
  "@ceird/domains/mcp/McpToolExecutionError" as const;
class McpToolExecutionError extends Schema.TaggedErrorClass<McpToolExecutionError>()(
  MCP_TOOL_EXECUTION_ERROR_TAG,
  {
    cause: Schema.String,
    message: Schema.String,
    sourceTag: Schema.optional(Schema.String),
    toolName: Schema.String,
  }
) {}

export class McpToolRequestRuntime extends Context.Service<
  McpToolRequestRuntime,
  {
    readonly scopes: readonly string[];
  }
>()("McpToolRequestRuntime") {}

export type McpToolDomainServices =
  | JobsService
  | LabelsService
  | SitesService
  | DomainDrizzleService
  | SqlClient.SqlClient;
type McpToolPassthroughServices = HttpServerRequest.HttpServerRequest;

export class McpToolDomainRuntime extends Context.Service<
  McpToolDomainRuntime,
  {
    readonly run: <
      A,
      E,
      R extends McpToolDomainServices | McpToolPassthroughServices,
    >(
      effect: Effect.Effect<A, E, R>
    ) => Effect.Effect<A, unknown, Exclude<R, McpToolDomainServices>>;
  }
>()("McpToolDomainRuntime") {}

export interface McpToolDefinition<Name extends string = string> {
  readonly name: Name;
  readonly description: string;
  readonly requiredScope: McpToolScope;
  readonly isAdminTool: boolean;
  readonly isDestructive: boolean;
  readonly isReadonly: boolean;
}

interface McpToolRegistration {
  readonly name: string;
  readonly requiredScope: McpToolScope;
  readonly isAdminTool: boolean;
}

const LabelsListDefinition = {
  name: "ceird.labels.list",
  description: "List labels for the current organization.",
  requiredScope: "ceird:read",
  isAdminTool: false,
  isDestructive: false,
  isReadonly: true,
} as const satisfies McpToolDefinition<"ceird.labels.list">;

const SitesOptionsDefinition = {
  name: "ceird.sites.options",
  description: "Get site options for the current organization.",
  requiredScope: "ceird:read",
  isAdminTool: false,
  isDestructive: false,
  isReadonly: true,
} as const satisfies McpToolDefinition<"ceird.sites.options">;

const JobsListDefinition = {
  name: "ceird.jobs.list",
  description: "List jobs in the current organization.",
  requiredScope: "ceird:read",
  isAdminTool: false,
  isDestructive: false,
  isReadonly: true,
} as const satisfies McpToolDefinition<"ceird.jobs.list">;

const JobsDetailDefinition = {
  name: "ceird.jobs.detail",
  description: "Load job detail by work item id.",
  requiredScope: "ceird:read",
  isAdminTool: false,
  isDestructive: false,
  isReadonly: true,
} as const satisfies McpToolDefinition<"ceird.jobs.detail">;

const JobsOptionsDefinition = {
  name: "ceird.jobs.options",
  description: "Get options for jobs workflows.",
  requiredScope: "ceird:read",
  isAdminTool: false,
  isDestructive: false,
  isReadonly: true,
} as const satisfies McpToolDefinition<"ceird.jobs.options">;

const JobsActivityListDefinition = {
  name: "ceird.jobs.activity.list",
  description: "List organization job activity.",
  requiredScope: "ceird:admin",
  isAdminTool: true,
  isDestructive: false,
  isReadonly: true,
} as const satisfies McpToolDefinition<"ceird.jobs.activity.list">;

const JobsAddCommentDefinition = {
  name: "ceird.jobs.add_comment",
  description: "Add a comment to a job.",
  requiredScope: "ceird:write",
  isAdminTool: false,
  isDestructive: false,
  isReadonly: false,
} as const satisfies McpToolDefinition<"ceird.jobs.add_comment">;

const JobsAssignLabelDefinition = {
  name: "ceird.jobs.assign_label",
  description: "Assign a label to a job.",
  requiredScope: "ceird:write",
  isAdminTool: false,
  isDestructive: false,
  isReadonly: false,
} as const satisfies McpToolDefinition<"ceird.jobs.assign_label">;

const JobsRemoveLabelDefinition = {
  name: "ceird.jobs.remove_label",
  description: "Remove a label from a job.",
  requiredScope: "ceird:write",
  isAdminTool: false,
  isDestructive: true,
  isReadonly: false,
} as const satisfies McpToolDefinition<"ceird.jobs.remove_label">;

export const MCP_TOOL_DEFINITIONS = [
  LabelsListDefinition,
  SitesOptionsDefinition,
  JobsListDefinition,
  JobsDetailDefinition,
  JobsOptionsDefinition,
  JobsActivityListDefinition,
  JobsAddCommentDefinition,
  JobsAssignLabelDefinition,
  JobsRemoveLabelDefinition,
] as const;

export const MCP_TOOL_REGISTRATIONS = MCP_TOOL_DEFINITIONS.map(
  ({ isAdminTool, name, requiredScope }) => ({
    isAdminTool,
    name,
    requiredScope,
  })
) satisfies readonly McpToolRegistration[];

const ToolOutputSchema = Schema.Unknown;
const OptionalString = Schema.optional(Schema.String);
const OptionalLimit = Schema.optional(
  Schema.Union([Schema.Number, Schema.String])
);

const McpToolDependencies = [
  McpToolDomainRuntime,
  McpToolRequestRuntime,
  HttpServerRequest.HttpServerRequest,
];

const LabelsListTool = Tool.make(LabelsListDefinition.name, {
  description: LabelsListDefinition.description,
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: McpToolDependencies,
})
  .annotate(Tool.Destructive, LabelsListDefinition.isDestructive)
  .annotate(Tool.Readonly, LabelsListDefinition.isReadonly);

const SitesOptionsTool = Tool.make(SitesOptionsDefinition.name, {
  description: SitesOptionsDefinition.description,
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: McpToolDependencies,
})
  .annotate(Tool.Destructive, SitesOptionsDefinition.isDestructive)
  .annotate(Tool.Readonly, SitesOptionsDefinition.isReadonly);

const JobsListTool = Tool.make(JobsListDefinition.name, {
  description: JobsListDefinition.description,
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: McpToolDependencies,
  parameters: Schema.Struct({
    assigneeId: Schema.optional(UserId),
    coordinatorId: Schema.optional(UserId),
    cursor: OptionalString,
    labelId: Schema.optional(LabelId),
    limit: OptionalLimit,
    priority: OptionalString,
    siteId: Schema.optional(SiteId),
    status: OptionalString,
  }),
})
  .annotate(Tool.Destructive, JobsListDefinition.isDestructive)
  .annotate(Tool.Readonly, JobsListDefinition.isReadonly);

const JobsDetailTool = Tool.make(JobsDetailDefinition.name, {
  description: JobsDetailDefinition.description,
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: McpToolDependencies,
  parameters: Schema.Struct({ workItemId: WorkItemId }),
})
  .annotate(Tool.Destructive, JobsDetailDefinition.isDestructive)
  .annotate(Tool.Readonly, JobsDetailDefinition.isReadonly);

const JobsOptionsTool = Tool.make(JobsOptionsDefinition.name, {
  description: JobsOptionsDefinition.description,
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: McpToolDependencies,
})
  .annotate(Tool.Destructive, JobsOptionsDefinition.isDestructive)
  .annotate(Tool.Readonly, JobsOptionsDefinition.isReadonly);

const JobsActivityListTool = Tool.make(JobsActivityListDefinition.name, {
  description: JobsActivityListDefinition.description,
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: McpToolDependencies,
  parameters: Schema.Struct({
    actorUserId: Schema.optional(UserId),
    cursor: OptionalString,
    eventType: OptionalString,
    fromDate: OptionalString,
    jobTitle: OptionalString,
    limit: OptionalLimit,
    toDate: OptionalString,
  }),
})
  .annotate(Tool.Destructive, JobsActivityListDefinition.isDestructive)
  .annotate(Tool.Readonly, JobsActivityListDefinition.isReadonly);

const JobsAddCommentTool = Tool.make(JobsAddCommentDefinition.name, {
  description: JobsAddCommentDefinition.description,
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: McpToolDependencies,
  parameters: Schema.Struct({
    body: Schema.String,
    workItemId: WorkItemId,
  }),
})
  .annotate(Tool.Destructive, JobsAddCommentDefinition.isDestructive)
  .annotate(Tool.Readonly, JobsAddCommentDefinition.isReadonly);

const JobsAssignLabelTool = Tool.make(JobsAssignLabelDefinition.name, {
  description: JobsAssignLabelDefinition.description,
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: McpToolDependencies,
  parameters: Schema.Struct({
    labelId: LabelId,
    workItemId: WorkItemId,
  }),
})
  .annotate(Tool.Destructive, JobsAssignLabelDefinition.isDestructive)
  .annotate(Tool.Readonly, JobsAssignLabelDefinition.isReadonly);

const JobsRemoveLabelTool = Tool.make(JobsRemoveLabelDefinition.name, {
  description: JobsRemoveLabelDefinition.description,
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: McpToolDependencies,
  parameters: Schema.Struct({
    labelId: LabelId,
    workItemId: WorkItemId,
  }),
})
  .annotate(Tool.Destructive, JobsRemoveLabelDefinition.isDestructive)
  .annotate(Tool.Readonly, JobsRemoveLabelDefinition.isReadonly);

export const CeirdMcpToolkit = Toolkit.make(
  LabelsListTool,
  SitesOptionsTool,
  JobsListTool,
  JobsDetailTool,
  JobsOptionsTool,
  JobsActivityListTool,
  JobsAddCommentTool,
  JobsAssignLabelTool,
  JobsRemoveLabelTool
);

export const CeirdMcpToolkitLayer = CeirdMcpToolkit.toLayer({
  [LabelsListDefinition.name]: () =>
    authorizeAndRun(LabelsListDefinition, () =>
      runMcpDomainTool(LabelsService.list())
    ),
  [SitesOptionsDefinition.name]: () =>
    authorizeAndRun(SitesOptionsDefinition, () =>
      runMcpDomainTool(SitesService.getOptions())
    ),
  [JobsListDefinition.name]: (input) =>
    authorizeAndRun(JobsListDefinition, () =>
      runMcpDomainTool(
        decodeWithSchema(
          JobsListDefinition.name,
          JobListQuerySchema,
          normalizeLimit(input)
        ).pipe(Effect.flatMap((query) => JobsService.list(query)))
      )
    ),
  [JobsDetailDefinition.name]: ({ workItemId }) =>
    authorizeAndRun(JobsDetailDefinition, () =>
      runMcpDomainTool(JobsService.getDetail(workItemId))
    ),
  [JobsOptionsDefinition.name]: () =>
    authorizeAndRun(JobsOptionsDefinition, () =>
      runMcpDomainTool(JobsService.getOptions())
    ),
  [JobsActivityListDefinition.name]: (input) =>
    authorizeAndRun(JobsActivityListDefinition, () =>
      runMcpDomainTool(
        decodeWithSchema(
          JobsActivityListDefinition.name,
          OrganizationActivityQuerySchema,
          normalizeLimit(input)
        ).pipe(
          Effect.flatMap((query) => JobsService.listOrganizationActivity(query))
        )
      )
    ),
  [JobsAddCommentDefinition.name]: ({ body, workItemId }) =>
    authorizeAndRun(JobsAddCommentDefinition, () =>
      runMcpDomainTool(
        decodeWithSchema(
          JobsAddCommentDefinition.name,
          AddJobCommentInputSchema,
          {
            body,
          }
        ).pipe(
          Effect.flatMap((payload) =>
            JobsService.addComment(workItemId, payload)
          )
        )
      )
    ),
  [JobsAssignLabelDefinition.name]: ({ labelId, workItemId }) =>
    authorizeAndRun(JobsAssignLabelDefinition, () =>
      runMcpDomainTool(
        decodeWithSchema(
          JobsAssignLabelDefinition.name,
          AssignJobLabelInputSchema,
          {
            labelId,
          }
        ).pipe(
          Effect.flatMap((payload) =>
            JobsService.assignLabel(workItemId, payload)
          )
        )
      )
    ),
  [JobsRemoveLabelDefinition.name]: ({ labelId, workItemId }) =>
    authorizeAndRun(JobsRemoveLabelDefinition, () =>
      runMcpDomainTool(JobsService.removeLabel(workItemId, labelId))
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
  definition: McpToolDefinition,
  buildEffect: () => Effect.Effect<A, E, R>
) {
  return Effect.gen(function* () {
    const runtime = yield* McpToolRequestRuntime;
    yield* Effect.annotateCurrentSpan({
      "mcp.required_scope": definition.requiredScope,
      "mcp.scope_count": runtime.scopes.length,
      "mcp.tool": definition.name,
    });

    if (!hasRequiredScope(runtime.scopes, definition.requiredScope)) {
      return yield* new McpToolForbiddenError({
        message: `Forbidden: missing ${definition.requiredScope} scope`,
        requiredScope: definition.requiredScope,
        toolName: definition.name,
      });
    }

    return yield* buildEffect().pipe(
      Effect.mapError((error) => {
        if (isMcpToolInternalError(error)) {
          return error;
        }

        const cause = formatUnknownError(error);
        const sourceTag = getUnknownErrorTag(error);

        return new McpToolExecutionError({
          cause,
          message: `Tool execution failed${sourceTag ? ` (${sourceTag})` : ""}: ${cause}`,
          ...(sourceTag ? { sourceTag } : {}),
          toolName: definition.name,
        });
      })
    );
  }).pipe(
    Effect.mapError(toMcpToolFailure),
    Effect.withSpan(`McpTool.${definition.name}`)
  );
}

function runMcpDomainTool<
  A,
  E,
  R extends McpToolDomainServices | McpToolPassthroughServices,
>(effect: Effect.Effect<A, E, R>) {
  return McpToolDomainRuntime.pipe(
    Effect.flatMap((runtime) => runtime.run(effect))
  );
}

function decodeWithSchema<A>(
  toolName: string,
  schema: Schema.Decoder<A>,
  input: unknown
) {
  return Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError((parseError) => {
      const details = String(parseError);

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

function getUnknownErrorTag(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    typeof error._tag === "string"
  ) {
    return error._tag;
  }
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
