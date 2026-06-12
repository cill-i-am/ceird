/* oxlint-disable eslint/max-classes-per-file */

import { WorkItemId } from "@ceird/jobs-core/ids";
import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";

import {
  AgentActionManifestResponseSchema,
  AgentActionNameSchema,
} from "./action-definitions.js";
import {
  AGENT_ACTIONS_PATH,
  AGENT_INTERNAL_ACTIONS_PATH,
  AGENT_INTERNAL_CURRENT_LOCATION_ACCESS_PATH,
  AGENT_INTERNAL_THREAD_ACTIVITY_PATH,
  AgentConnectAuthorizationSchema,
  AgentCurrentLocationAccessResponseSchema,
  AgentStorageOperation,
  AgentThreadId,
  AgentThreadListQuerySchema,
  AgentThreadListResponseSchema,
  AgentThreadResponseSchema,
  CreateAgentThreadInputSchema,
  PreparedAgentSessionSchema,
  PrepareAgentSessionInputSchema,
  RunAgentActionInputSchema,
  RunAgentActionResponseSchema,
} from "./shared.js";

export {
  AGENT_ACTION_DEFINITIONS,
  AGENT_ACTION_MANIFEST_SCHEMA,
  AGENT_ACTION_NAMES,
  AGENT_ACTIONS,
  AGENT_ACTIONS_MANIFEST,
  AGENT_EXECUTABLE_ACTION_MANIFEST,
  AGENT_EXECUTABLE_ACTION_NAMES,
  AGENT_EXECUTABLE_ACTIONS,
  AgentActionManifestItemSchema,
  AgentActionManifestResponseSchema,
  AgentActionNameSchema,
  ExecutableAgentActionNameSchema,
  getAgentActionDefinition,
  getAgentActionInputSchema,
  getAgentActionKind,
  getAgentActionManifest,
  isAgentActionExecutable,
  projectAgentActionManifest,
} from "./action-definitions.js";
export type {
  AgentActionDefinition,
  AgentActionInput,
  AgentActionManifestItem,
  AgentActionManifestResponse,
  AgentActionName,
  ExecutableAgentActionName,
} from "./action-definitions.js";
export {
  AGENT_ACTION_KINDS,
  AgentActionConfirmationPolicy,
  AgentActionExecutionStatus,
  AgentActionKindSchema,
  defineAgentAction,
} from "./action-registry.js";
export type {
  AgentActionConfirmationPolicy as AgentActionConfirmationPolicyType,
  AgentActionExecutionStatus as AgentActionExecutionStatusType,
  AgentActionKind,
  AgentActionSpec,
} from "./action-registry.js";
export {
  AGENT_PROXIMITY_ORIGIN_CONTEXT_ID_BODY_KEY,
  AGENT_PROXIMITY_ORIGIN_CONTEXT_MESSAGE_TYPE,
  AgentProximityOriginContextFrameSchema,
  AgentProximityOriginContextId,
  makeAgentProximityOriginContextBody,
  makeAgentProximityOriginContextFrame,
  readAgentProximityOriginContextFrame,
  readAgentProximityOriginContextIdFromBody,
} from "./proximity-context.js";
export type {
  AgentProximityOriginContextFrame,
  AgentProximityOriginContextId as AgentProximityOriginContextIdType,
} from "./proximity-context.js";
export {
  AGENT_ACTIONS_PATH,
  AGENT_ACTION_RUN_STATUSES,
  AGENT_INTERNAL_ACTIONS_PATH,
  AGENT_INTERNAL_CURRENT_LOCATION_ACCESS_PATH,
  AGENT_INTERNAL_PATH_PREFIX,
  AGENT_INTERNAL_THREAD_ACTIVITY_PATH,
  AGENT_STORAGE_OPERATIONS,
  AGENT_THREAD_LIST_DEFAULT_LIMIT,
  AGENT_THREAD_LIST_MAX_LIMIT,
  AGENT_THREAD_STATUSES,
  AgentActionOperationId,
  AgentActionRunId,
  AgentActionRunStatus,
  AgentConnectAuthorizationSchema,
  AgentConnectTokenInvalidError,
  AgentCurrentLocationAccessResponseSchema,
  AgentInstanceName,
  AgentStorageOperation,
  AgentThreadId,
  AgentThreadListQuerySchema,
  AgentThreadListResponseSchema,
  AgentThreadResponseSchema,
  AgentThreadSchema,
  AgentThreadStatus,
  CreateAgentThreadInputSchema,
  IsoDateTimeString,
  PreparedAgentSessionSchema,
  PrepareAgentSessionInputSchema,
  RunAgentActionInputSchema,
  RunAgentActionResponseSchema,
  buildAgentInstanceName,
  isAgentInternalPath,
  makeAgentInternalCurrentLocationAccessPath,
  makeAgentInternalThreadActivityPath,
  parseAgentInstanceName,
  signAgentConnectToken,
  timingSafeEqual,
  verifyAgentConnectToken,
} from "./shared.js";
export type {
  AgentConnectAuthorization,
  AgentCurrentLocationAccessResponse,
  AgentThread,
  AgentThreadListQuery,
  AgentThreadListResponse,
  AgentThreadResponse,
  CreateAgentThreadInput,
  ParsedAgentInstanceName,
  PreparedAgentSession,
  PrepareAgentSessionInput,
  RunAgentActionInput,
  RunAgentActionResponse,
  SignAgentConnectTokenInput,
  VerifyAgentConnectTokenInput,
} from "./shared.js";

export const AGENT_ACCESS_DENIED_ERROR_TAG =
  "@ceird/agents-core/AgentAccessDeniedError" as const;
export const AGENT_THREAD_NOT_FOUND_ERROR_TAG =
  "@ceird/agents-core/AgentThreadNotFoundError" as const;
export const AGENT_STORAGE_ERROR_TAG =
  "@ceird/agents-core/AgentStorageError" as const;
export const AGENT_ACTION_REJECTED_ERROR_TAG =
  "@ceird/agents-core/AgentActionRejectedError" as const;

export class AgentAccessDeniedError extends Schema.TaggedErrorClass<AgentAccessDeniedError>()(
  AGENT_ACCESS_DENIED_ERROR_TAG,
  { message: Schema.String },
  { httpApiStatus: 403 }
) {}

export class AgentThreadNotFoundError extends Schema.TaggedErrorClass<AgentThreadNotFoundError>()(
  AGENT_THREAD_NOT_FOUND_ERROR_TAG,
  { message: Schema.String, threadId: Schema.optional(AgentThreadId) },
  { httpApiStatus: 404 }
) {}

export class AgentStorageError extends Schema.TaggedErrorClass<AgentStorageError>()(
  AGENT_STORAGE_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
    operation: AgentStorageOperation,
  },
  { httpApiStatus: 503 }
) {}

export class AgentActionRejectedError extends Schema.TaggedErrorClass<AgentActionRejectedError>()(
  AGENT_ACTION_REJECTED_ERROR_TAG,
  {
    actionName: Schema.optional(AgentActionNameSchema),
    cause: Schema.optional(Schema.String),
    message: Schema.String,
    workItemId: Schema.optional(WorkItemId),
  },
  { httpApiStatus: 400 }
) {}

export const AgentThreadsApiGroup = HttpApiGroup.make("agentThreads")
  .add(
    HttpApiEndpoint.post("prepareAgentSession", "/agent/session/prepare", {
      payload: PrepareAgentSessionInputSchema,
      success: PreparedAgentSessionSchema,
      error: [AgentAccessDeniedError, AgentStorageError],
    })
  )
  .add(
    HttpApiEndpoint.get("listAgentThreads", "/agent/threads", {
      query: AgentThreadListQuerySchema,
      success: AgentThreadListResponseSchema,
      error: [AgentAccessDeniedError, AgentStorageError],
    })
  )
  .add(
    HttpApiEndpoint.post("createAgentThread", "/agent/threads", {
      payload: CreateAgentThreadInputSchema,
      success: AgentThreadResponseSchema.pipe(HttpApiSchema.status("Created")),
      error: [AgentAccessDeniedError, AgentStorageError],
    })
  )
  .add(
    HttpApiEndpoint.post(
      "archiveAgentThread",
      "/agent/threads/:threadId/archive",
      {
        params: { threadId: AgentThreadId },
        success: AgentThreadResponseSchema,
        error: [
          AgentAccessDeniedError,
          AgentThreadNotFoundError,
          AgentStorageError,
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.post(
      "authorizeAgentConnect",
      "/agent/threads/:threadId/authorize",
      {
        params: { threadId: AgentThreadId },
        success: AgentConnectAuthorizationSchema,
        error: [
          AgentAccessDeniedError,
          AgentThreadNotFoundError,
          AgentStorageError,
        ],
      }
    )
  );

export const AgentActionsApiGroup = HttpApiGroup.make("agentActions").add(
  HttpApiEndpoint.get("getAgentActionManifest", AGENT_ACTIONS_PATH, {
    success: AgentActionManifestResponseSchema,
    error: [AgentAccessDeniedError, AgentStorageError],
  })
);

export const AgentInternalApiGroup = HttpApiGroup.make("agentInternal")
  .add(
    HttpApiEndpoint.post(
      "touchAgentThreadActivity",
      AGENT_INTERNAL_THREAD_ACTIVITY_PATH,
      {
        params: { threadId: AgentThreadId },
        success: AgentThreadResponseSchema,
        error: [
          AgentAccessDeniedError,
          AgentThreadNotFoundError,
          AgentStorageError,
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.post(
      "validateCurrentLocationAccess",
      AGENT_INTERNAL_CURRENT_LOCATION_ACCESS_PATH,
      {
        params: { threadId: AgentThreadId },
        success: AgentCurrentLocationAccessResponseSchema,
        error: [
          AgentAccessDeniedError,
          AgentThreadNotFoundError,
          AgentStorageError,
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.post("runAgentAction", AGENT_INTERNAL_ACTIONS_PATH, {
      payload: RunAgentActionInputSchema,
      success: RunAgentActionResponseSchema,
      error: [
        AgentAccessDeniedError,
        AgentActionRejectedError,
        AgentThreadNotFoundError,
        AgentStorageError,
      ],
    })
  );
