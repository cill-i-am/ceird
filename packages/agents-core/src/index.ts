/* oxlint-disable eslint/max-classes-per-file */

import { OrganizationId, UserId } from "@ceird/identity-core";
import { WorkItemId } from "@ceird/jobs-core";
import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";

import {
  AgentActionConfirmationPolicy,
  AgentActionExecutionStatus,
  AgentActionKindSchema,
} from "./action-registry.js";
import type { AgentActionSpec } from "./action-registry.js";
import { jobAgentActions, rateCardAgentActions } from "./actions/jobs.js";
import { labelAgentActions } from "./actions/labels.js";
import { organizationAgentActions } from "./actions/organization.js";
import { serviceAreaAgentActions, siteAgentActions } from "./actions/sites.js";

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

const ISO_DATE_TIME_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isIsoDateTimeString(value: string): boolean {
  return (
    ISO_DATE_TIME_UTC_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
  );
}

export const IsoDateTimeString = Schema.String.pipe(
  Schema.refine((value): value is string => isIsoDateTimeString(value), {
    message: "Expected an ISO-8601 UTC datetime string",
  }),
  Schema.annotate({
    description: "ISO-8601 UTC datetime string",
  })
);
export type IsoDateTimeString = Schema.Schema.Type<typeof IsoDateTimeString>;

export const AgentThreadId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@ceird/agents-core/AgentThreadId")
);
export type AgentThreadId = Schema.Schema.Type<typeof AgentThreadId>;

export const AgentActionRunId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@ceird/agents-core/AgentActionRunId")
);
export type AgentActionRunId = Schema.Schema.Type<typeof AgentActionRunId>;

export const AGENT_THREAD_STATUSES = ["active", "archived"] as const;
export const AgentThreadStatus = Schema.Literals(AGENT_THREAD_STATUSES);
export type AgentThreadStatus = Schema.Schema.Type<typeof AgentThreadStatus>;

export const AGENT_ACTION_RUN_STATUSES = [
  "running",
  "succeeded",
  "failed",
] as const;
export const AgentActionRunStatus = Schema.Literals(AGENT_ACTION_RUN_STATUSES);
export type AgentActionRunStatus = Schema.Schema.Type<
  typeof AgentActionRunStatus
>;

export const AgentInstanceName = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^org:[^:]+:user:[^:]+:thread:[0-9a-f-]{36}$/)),
  Schema.brand("@ceird/agents-core/AgentInstanceName")
);
export type AgentInstanceName = Schema.Schema.Type<typeof AgentInstanceName>;

export const AgentThreadSchema = Schema.Struct({
  agentInstanceName: AgentInstanceName,
  createdAt: IsoDateTimeString,
  id: AgentThreadId,
  lastMessageAt: Schema.NullOr(IsoDateTimeString),
  status: AgentThreadStatus,
  title: Schema.String,
  updatedAt: IsoDateTimeString,
});
export type AgentThread = Schema.Schema.Type<typeof AgentThreadSchema>;

export const AGENT_THREAD_LIST_DEFAULT_LIMIT = 50;
export const AGENT_THREAD_LIST_MAX_LIMIT = 100;

export const AgentThreadListQuerySchema = Schema.Struct({
  limit: Schema.optional(
    Schema.NumberFromString.pipe(
      Schema.check(
        Schema.isInt(),
        Schema.isGreaterThan(0),
        Schema.isLessThanOrEqualTo(AGENT_THREAD_LIST_MAX_LIMIT)
      )
    )
  ),
});
export type AgentThreadListQuery = Schema.Schema.Type<
  typeof AgentThreadListQuerySchema
>;

export const CreateAgentThreadInputSchema = Schema.Struct({
  title: Schema.optional(
    Schema.Trim.pipe(
      Schema.check(Schema.isMinLength(1), Schema.isMaxLength(120))
    )
  ),
});
export type CreateAgentThreadInput = Schema.Schema.Type<
  typeof CreateAgentThreadInputSchema
>;

export const AgentThreadListResponseSchema = Schema.Struct({
  items: Schema.Array(AgentThreadSchema),
});
export type AgentThreadListResponse = Schema.Schema.Type<
  typeof AgentThreadListResponseSchema
>;

export const AgentThreadResponseSchema = Schema.Struct({
  item: AgentThreadSchema,
});
export type AgentThreadResponse = Schema.Schema.Type<
  typeof AgentThreadResponseSchema
>;

export const AgentConnectAuthorizationSchema = Schema.Struct({
  agentInstanceName: AgentInstanceName,
  token: Schema.String,
});
export type AgentConnectAuthorization = Schema.Schema.Type<
  typeof AgentConnectAuthorizationSchema
>;

export const AGENT_ACTIONS = [
  ...labelAgentActions,
  ...siteAgentActions,
  ...serviceAreaAgentActions,
  ...jobAgentActions,
  ...rateCardAgentActions,
  ...organizationAgentActions,
] as const;

type AgentActionNameTuple = readonly [
  (typeof AGENT_ACTIONS)[number]["name"],
  ...(typeof AGENT_ACTIONS)[number]["name"][],
];

export const AGENT_ACTION_NAMES = AGENT_ACTIONS.map(
  (action) => action.name
) as unknown as AgentActionNameTuple;
export const AgentActionNameSchema = Schema.Literals(AGENT_ACTION_NAMES);
export type AgentActionName = Schema.Schema.Type<typeof AgentActionNameSchema>;
export type AgentActionDefinition<
  Name extends AgentActionName = AgentActionName,
> = Extract<(typeof AGENT_ACTIONS)[number], { readonly name: Name }>;
export type AgentActionInput<Name extends AgentActionName> = Schema.Schema.Type<
  AgentActionDefinition<Name>["inputSchema"]
>;

export const AGENT_EXECUTABLE_ACTIONS = AGENT_ACTIONS.filter(
  (action) => action.executionStatus === "executable"
) as Extract<
  (typeof AGENT_ACTIONS)[number],
  { readonly executionStatus: "executable" }
>[];

type ExecutableAgentActionNameTuple = readonly [
  (typeof AGENT_EXECUTABLE_ACTIONS)[number]["name"],
  ...(typeof AGENT_EXECUTABLE_ACTIONS)[number]["name"][],
];

export const AGENT_EXECUTABLE_ACTION_NAMES = AGENT_EXECUTABLE_ACTIONS.map(
  (action) => action.name
) as unknown as ExecutableAgentActionNameTuple;
export const ExecutableAgentActionNameSchema = Schema.Literals(
  AGENT_EXECUTABLE_ACTION_NAMES
);
export type ExecutableAgentActionName = Schema.Schema.Type<
  typeof ExecutableAgentActionNameSchema
>;

const AGENT_ACTIONS_BY_NAME = Object.fromEntries(
  AGENT_ACTIONS.map((action) => [action.name, action])
) as {
  readonly [Action in (typeof AGENT_ACTIONS)[number] as Action["name"]]: Action;
};

export const AGENT_ACTION_DEFINITIONS = AGENT_ACTIONS_BY_NAME;

export function getAgentActionDefinition<const Name extends AgentActionName>(
  name: Name
): AgentActionDefinition<Name> {
  const action = AGENT_ACTIONS_BY_NAME[name];

  return action as unknown as AgentActionDefinition<Name>;
}

export function getAgentActionKind(
  name: AgentActionName
): (typeof AGENT_ACTIONS)[number]["kind"] {
  return getAgentActionDefinition(name).kind;
}

export function isAgentActionExecutable(
  name: AgentActionName
): name is ExecutableAgentActionName {
  return AGENT_EXECUTABLE_ACTION_NAMES.includes(
    name as ExecutableAgentActionName
  );
}

export const AgentActionManifestItemSchema = Schema.Struct({
  confirmationPolicy: AgentActionConfirmationPolicy,
  display: Schema.Struct({
    label: Schema.String,
    summary: Schema.String,
    target: Schema.optional(Schema.String),
  }),
  executionStatus: AgentActionExecutionStatus,
  kind: AgentActionKindSchema,
  modelDescription: Schema.String,
  modelName: Schema.String,
  name: AgentActionNameSchema,
});
export type AgentActionManifestItem = Schema.Schema.Type<
  typeof AgentActionManifestItemSchema
>;

export const AgentActionManifestResponseSchema = Schema.Struct({
  actions: Schema.Array(AgentActionManifestItemSchema),
});
export type AgentActionManifestResponse = Schema.Schema.Type<
  typeof AgentActionManifestResponseSchema
>;

export const AGENT_ACTION_MANIFEST_SCHEMA = AgentActionManifestResponseSchema;

export function projectAgentActionManifest(
  actions: readonly AgentActionSpec<AgentActionName>[]
): AgentActionManifestResponse {
  return {
    actions: actions.map((action) => ({
      confirmationPolicy: action.confirmationPolicy,
      display: action.display,
      executionStatus: action.executionStatus,
      kind: action.kind,
      modelDescription: action.modelDescription,
      modelName: action.modelName,
      name: action.name,
    })),
  };
}

export const AGENT_ACTIONS_MANIFEST = projectAgentActionManifest(AGENT_ACTIONS);
export const AGENT_EXECUTABLE_ACTION_MANIFEST = projectAgentActionManifest(
  AGENT_EXECUTABLE_ACTIONS
);

export function getAgentActionManifest(
  options: { readonly executableOnly?: boolean } = {}
): AgentActionManifestResponse {
  return options.executableOnly === true
    ? AGENT_EXECUTABLE_ACTION_MANIFEST
    : AGENT_ACTIONS_MANIFEST;
}

export const AgentActionOperationId = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[a-zA-Z0-9_.:-]{8,160}$/)),
  Schema.brand("@ceird/agents-core/AgentActionOperationId")
);
export type AgentActionOperationId = Schema.Schema.Type<
  typeof AgentActionOperationId
>;

export const RunAgentActionInputSchema = Schema.Struct({
  input: Schema.Unknown,
  name: ExecutableAgentActionNameSchema,
  operationId: AgentActionOperationId,
  threadId: AgentThreadId,
});
export type RunAgentActionInput = Schema.Schema.Type<
  typeof RunAgentActionInputSchema
>;

export const RunAgentActionResponseSchema = Schema.Struct({
  actionRunId: AgentActionRunId,
  replayed: Schema.Boolean,
  result: Schema.Unknown,
});
export type RunAgentActionResponse = Schema.Schema.Type<
  typeof RunAgentActionResponseSchema
>;

export const AGENT_STORAGE_OPERATIONS = [
  "thread.list",
  "thread.create",
  "thread.archive",
  "thread.authorizeConnect",
  "thread.touchActivity",
  "action.manifest",
  "action.run",
  "action.execute",
] as const;
export const AgentStorageOperation = Schema.Literals(AGENT_STORAGE_OPERATIONS);
export type AgentStorageOperation = Schema.Schema.Type<
  typeof AgentStorageOperation
>;

export const AGENT_ACTIONS_PATH = "/agent/actions" as const;
export const AGENT_INTERNAL_PATH_PREFIX = "/agent/internal" as const;
export const AGENT_INTERNAL_ACTIONS_PATH =
  `${AGENT_INTERNAL_PATH_PREFIX}/actions` as const;
export const AGENT_INTERNAL_THREAD_ACTIVITY_PATH =
  `${AGENT_INTERNAL_PATH_PREFIX}/threads/:threadId/activity` as const;

export function makeAgentInternalThreadActivityPath(
  threadId: AgentThreadId
): string {
  return `${AGENT_INTERNAL_PATH_PREFIX}/threads/${threadId}/activity`;
}

export function isAgentInternalPath(pathname: string): boolean {
  return pathname.startsWith(`${AGENT_INTERNAL_PATH_PREFIX}/`);
}

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

export function buildAgentInstanceName(input: {
  readonly organizationId: OrganizationId;
  readonly threadId: AgentThreadId;
  readonly userId: UserId;
}): AgentInstanceName {
  const raw = `org:${encodeURIComponent(input.organizationId)}:user:${encodeURIComponent(
    input.userId
  )}:thread:${input.threadId}`;

  return Schema.decodeUnknownSync(AgentInstanceName)(raw);
}

export interface ParsedAgentInstanceName {
  readonly organizationId: OrganizationId;
  readonly threadId: AgentThreadId;
  readonly userId: UserId;
}

export function parseAgentInstanceName(
  value: AgentInstanceName
): ParsedAgentInstanceName {
  const match = /^org:([^:]+):user:([^:]+):thread:([0-9a-f-]{36})$/.exec(value);

  if (!match) {
    throw new Error(`Invalid agent instance name: ${value}`);
  }
  const [, rawOrganizationId, rawUserId, rawThreadId] = match;

  if (
    rawOrganizationId === undefined ||
    rawUserId === undefined ||
    rawThreadId === undefined
  ) {
    throw new Error(`Invalid agent instance name: ${value}`);
  }

  return {
    organizationId: Schema.decodeUnknownSync(OrganizationId)(
      decodeURIComponent(rawOrganizationId)
    ),
    threadId: Schema.decodeUnknownSync(AgentThreadId)(rawThreadId),
    userId: Schema.decodeUnknownSync(UserId)(decodeURIComponent(rawUserId)),
  };
}

const AGENT_CONNECT_TOKEN_VERSION = "v1";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const hmacKeyCache = new Map<string, Promise<CryptoKey>>();

const AgentConnectTokenPayloadSchema = Schema.Struct({
  agentInstanceName: AgentInstanceName,
  exp: Schema.Number,
});

export interface SignAgentConnectTokenInput {
  readonly agentInstanceName: AgentInstanceName;
  readonly now?: Date | undefined;
  readonly secret: string;
  readonly ttlSeconds: number;
}

export interface VerifyAgentConnectTokenInput {
  readonly now?: Date | undefined;
  readonly secret: string;
  readonly token: string;
}

export class AgentConnectTokenInvalidError extends Error {
  override readonly name = "AgentConnectTokenInvalidError";
}

export async function signAgentConnectToken(
  input: SignAgentConnectTokenInput
): Promise<string> {
  const now = input.now ?? new Date();
  const payload = {
    agentInstanceName: input.agentInstanceName,
    exp: Math.floor(now.getTime() / 1000) + input.ttlSeconds,
  };
  const encodedPayload = base64UrlEncode(
    textEncoder.encode(JSON.stringify(payload))
  );
  const signature = await signAgentConnectTokenPayload(
    input.secret,
    encodedPayload
  );

  return `${AGENT_CONNECT_TOKEN_VERSION}.${encodedPayload}.${signature}`;
}

export async function verifyAgentConnectToken(
  input: VerifyAgentConnectTokenInput
): Promise<AgentInstanceName> {
  const [version, encodedPayload, signature, ...extraParts] =
    input.token.split(".");

  if (
    version !== AGENT_CONNECT_TOKEN_VERSION ||
    encodedPayload === undefined ||
    signature === undefined ||
    extraParts.length > 0
  ) {
    throw new AgentConnectTokenInvalidError("Invalid agent token shape");
  }

  const expectedSignature = await signAgentConnectTokenPayload(
    input.secret,
    encodedPayload
  );

  if (!timingSafeEqual(signature, expectedSignature)) {
    throw new AgentConnectTokenInvalidError("Invalid agent token signature");
  }

  const payload = decodeAgentConnectTokenPayload(encodedPayload);
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);

  if (payload.exp < now) {
    throw new AgentConnectTokenInvalidError("Agent token expired");
  }

  return payload.agentInstanceName;
}

function decodeAgentConnectTokenPayload(encodedPayload: string) {
  try {
    return Schema.decodeUnknownSync(AgentConnectTokenPayloadSchema)(
      JSON.parse(textDecoder.decode(base64UrlDecode(encodedPayload)))
    );
  } catch {
    throw new AgentConnectTokenInvalidError("Invalid agent token payload");
  }
}

async function signAgentConnectTokenPayload(
  secret: string,
  data: string
): Promise<string> {
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(data)
  );

  return base64UrlEncode(new Uint8Array(signature));
}

function getHmacKey(secret: string): Promise<CryptoKey> {
  const cached = hmacKeyCache.get(secret);

  if (cached !== undefined) {
    return cached;
  }

  const imported = crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  hmacKeyCache.set(secret, imported);

  return imported;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "="
  );
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.codePointAt(index) ?? 0;
  }

  return bytes;
}

export function timingSafeEqual(left: string, right: string): boolean {
  let difference = Number(left.length !== right.length);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    difference += Number(left.codePointAt(index) !== right.codePointAt(index));
  }

  return difference === 0;
}
