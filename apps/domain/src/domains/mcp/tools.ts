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
import { ServiceAreaId, SiteId } from "@ceird/sites-core";
import { Context, Effect, Schema } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";
import { HttpServerRequest } from "effect/unstable/http";

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

type McpToolDomainServices =
  | ConfigurationService
  | JobsService
  | LabelsService
  | SitesService;
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
  Schema.Union([Schema.Number, Schema.String])
);

const LabelsListTool = Tool.make("ceird.labels.list", {
  description: "List labels for the current organization.",
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolDomainRuntime,
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, true);

const SitesOptionsTool = Tool.make("ceird.sites.options", {
  description: "Get site options for the current organization.",
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolDomainRuntime,
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, true);

const JobsListTool = Tool.make("ceird.jobs.list", {
  description: "List jobs in the current organization.",
  parameters: Schema.Struct({
    assigneeId: Schema.optional(UserId),
    coordinatorId: Schema.optional(UserId),
    cursor: OptionalString,
    labelId: Schema.optional(LabelId),
    limit: OptionalLimit,
    priority: OptionalString,
    serviceAreaId: Schema.optional(ServiceAreaId),
    siteId: Schema.optional(SiteId),
    status: OptionalString,
  }),
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolDomainRuntime,
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, true);

const JobsDetailTool = Tool.make("ceird.jobs.detail", {
  description: "Load job detail by work item id.",
  parameters: Schema.Struct({ workItemId: WorkItemId }),
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolDomainRuntime,
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, true);

const JobsOptionsTool = Tool.make("ceird.jobs.options", {
  description: "Get options for jobs workflows.",
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolDomainRuntime,
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, true);

const JobsActivityListTool = Tool.make("ceird.jobs.activity.list", {
  description: "List organization job activity.",
  parameters: Schema.Struct({
    actorUserId: Schema.optional(UserId),
    cursor: OptionalString,
    eventType: OptionalString,
    fromDate: OptionalString,
    jobTitle: OptionalString,
    limit: OptionalLimit,
    toDate: OptionalString,
  }),
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolDomainRuntime,
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, true);

const RateCardsListTool = Tool.make("ceird.rate_cards.list", {
  description: "List rate cards for jobs configuration.",
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolDomainRuntime,
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, true);

const JobsAddCommentTool = Tool.make("ceird.jobs.add_comment", {
  description: "Add a comment to a job.",
  parameters: Schema.Struct({
    body: Schema.String,
    workItemId: WorkItemId,
  }),
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolDomainRuntime,
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, false);

const JobsAssignLabelTool = Tool.make("ceird.jobs.assign_label", {
  description: "Assign a label to a job.",
  parameters: Schema.Struct({
    labelId: LabelId,
    workItemId: WorkItemId,
  }),
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolDomainRuntime,
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
  ],
})
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Readonly, false);

const JobsRemoveLabelTool = Tool.make("ceird.jobs.remove_label", {
  description: "Remove a label from a job.",
  parameters: Schema.Struct({
    labelId: LabelId,
    workItemId: WorkItemId,
  }),
  failure: McpToolFailureSchema,
  success: ToolOutputSchema,
  dependencies: [
    McpToolDomainRuntime,
    McpToolRequestRuntime,
    HttpServerRequest.HttpServerRequest,
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
      runMcpDomainTool(LabelsService.list())
    ),
  "ceird.sites.options": () =>
    authorizeAndRun("ceird.sites.options", "ceird:read", () =>
      runMcpDomainTool(SitesService.getOptions())
    ),
  "ceird.jobs.list": (input) =>
    authorizeAndRun("ceird.jobs.list", "ceird:read", () =>
      runMcpDomainTool(
        decodeWithSchema(
          "ceird.jobs.list",
          JobListQuerySchema,
          normalizeLimit(input)
        ).pipe(Effect.flatMap((query) => JobsService.list(query)))
      )
    ),
  "ceird.jobs.detail": ({ workItemId }) =>
    authorizeAndRun("ceird.jobs.detail", "ceird:read", () =>
      runMcpDomainTool(JobsService.getDetail(workItemId))
    ),
  "ceird.jobs.options": () =>
    authorizeAndRun("ceird.jobs.options", "ceird:read", () =>
      runMcpDomainTool(JobsService.getOptions())
    ),
  "ceird.jobs.activity.list": (input) =>
    authorizeAndRun("ceird.jobs.activity.list", "ceird:admin", () =>
      runMcpDomainTool(
        decodeWithSchema(
          "ceird.jobs.activity.list",
          OrganizationActivityQuerySchema,
          normalizeLimit(input)
        ).pipe(
          Effect.flatMap((query) => JobsService.listOrganizationActivity(query))
        )
      )
    ),
  "ceird.rate_cards.list": () =>
    authorizeAndRun("ceird.rate_cards.list", "ceird:admin", () =>
      runMcpDomainTool(ConfigurationService.listRateCards())
    ),
  "ceird.jobs.add_comment": ({ body, workItemId }) =>
    authorizeAndRun("ceird.jobs.add_comment", "ceird:write", () =>
      runMcpDomainTool(
        decodeWithSchema("ceird.jobs.add_comment", AddJobCommentInputSchema, {
          body,
        }).pipe(
          Effect.flatMap((payload) =>
            JobsService.addComment(workItemId, payload)
          )
        )
      )
    ),
  "ceird.jobs.assign_label": ({ labelId, workItemId }) =>
    authorizeAndRun("ceird.jobs.assign_label", "ceird:write", () =>
      runMcpDomainTool(
        decodeWithSchema("ceird.jobs.assign_label", AssignJobLabelInputSchema, {
          labelId,
        }).pipe(
          Effect.flatMap((payload) =>
            JobsService.assignLabel(workItemId, payload)
          )
        )
      )
    ),
  "ceird.jobs.remove_label": ({ labelId, workItemId }) =>
    authorizeAndRun("ceird.jobs.remove_label", "ceird:write", () =>
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
          toolName,
        });
      })
    );
  }).pipe(
    Effect.mapError(toMcpToolFailure),
    Effect.withSpan(`McpTool.${toolName}`)
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
