/* oxlint-disable eslint/max-classes-per-file */

import { OrganizationId, UserId } from "@ceird/identity-core";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform";
import { ParseResult, Schema } from "effect";

export {
  AGENT_ACTION_KINDS,
  AGENT_ACTION_MANIFEST_SCHEMA,
  AgentActionConfirmationPolicy,
  AgentActionKindSchema,
  AgentActionManifestItemSchema,
  AgentActionManifestResponseSchema,
  defineAgentAction,
} from "./action-registry.js";
export type {
  AgentActionConfirmationPolicy as AgentActionConfirmationPolicyType,
  AgentActionKind,
  AgentActionManifestItem,
  AgentActionManifestResponse,
  AgentActionSpec,
} from "./action-registry.js";
import type { AgentActionSpec } from "./action-registry.js";
import { jobAgentActions, rateCardAgentActions } from "./actions/jobs.js";
import { labelAgentActions } from "./actions/labels.js";
import { organizationAgentActions } from "./actions/organization.js";
import { serviceAreaAgentActions, siteAgentActions } from "./actions/sites.js";

const ISO_DATE_TIME_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isIsoDateTimeString(value: string): boolean {
  return (
    ISO_DATE_TIME_UTC_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
  );
}

export const IsoDateTimeString = Schema.String.pipe(
  Schema.filter((value) => isIsoDateTimeString(value)),
  Schema.annotations({
    description: "ISO-8601 UTC datetime string",
    message: () => "Expected an ISO-8601 UTC datetime string",
  })
);
export type IsoDateTimeString = Schema.Schema.Type<typeof IsoDateTimeString>;

export const AgentThreadId = Schema.UUID.pipe(
  Schema.brand("@ceird/agents-core/AgentThreadId")
);
export type AgentThreadId = Schema.Schema.Type<typeof AgentThreadId>;

export const AgentActionRunId = Schema.UUID.pipe(
  Schema.brand("@ceird/agents-core/AgentActionRunId")
);
export type AgentActionRunId = Schema.Schema.Type<typeof AgentActionRunId>;

export const AGENT_THREAD_STATUSES = ["active", "archived"] as const;
export const AgentThreadStatus = Schema.Literal(...AGENT_THREAD_STATUSES);
export type AgentThreadStatus = Schema.Schema.Type<typeof AgentThreadStatus>;

export const AGENT_ACTION_RUN_STATUSES = [
  "running",
  "succeeded",
  "failed",
] as const;
export const AgentActionRunStatus = Schema.Literal(
  ...AGENT_ACTION_RUN_STATUSES
);
export type AgentActionRunStatus = Schema.Schema.Type<
  typeof AgentActionRunStatus
>;

export const AgentInstanceName = Schema.String.pipe(
  Schema.pattern(/^org:[^:]+:user:[^:]+:thread:[0-9a-f-]{36}$/),
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
      Schema.int(),
      Schema.positive(),
      Schema.lessThanOrEqualTo(AGENT_THREAD_LIST_MAX_LIMIT)
    )
  ),
});
export type AgentThreadListQuery = Schema.Schema.Type<
  typeof AgentThreadListQuerySchema
>;

export const CreateAgentThreadInputSchema = Schema.Struct({
  title: Schema.optionalWith(
    Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(120)),
    { exact: true }
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
  ...Array<(typeof AGENT_ACTIONS)[number]["name"]>,
];

export const AGENT_ACTION_NAMES = AGENT_ACTIONS.map(
  (action) => action.name
) as unknown as AgentActionNameTuple;
export const AgentActionNameSchema = Schema.Literal(...AGENT_ACTION_NAMES);
export type AgentActionName = Schema.Schema.Type<typeof AgentActionNameSchema>;

const AGENT_ACTIONS_BY_NAME = Object.fromEntries(
  AGENT_ACTIONS.map((action) => [action.name, action])
) as Record<AgentActionName, (typeof AGENT_ACTIONS)[number]>;

export const AGENT_ACTION_DEFINITIONS = AGENT_ACTIONS_BY_NAME;

export function getAgentActionDefinition(
  name: AgentActionName
): AgentActionSpec<AgentActionName> {
  const action = AGENT_ACTIONS_BY_NAME[name];

  return action;
}

export function getAgentActionKind(
  name: AgentActionName
): (typeof AGENT_ACTIONS)[number]["kind"] {
  return getAgentActionDefinition(name).kind;
}

export const AgentActionOperationId = Schema.String.pipe(
  Schema.pattern(/^[a-zA-Z0-9_.:-]{8,160}$/),
  Schema.brand("@ceird/agents-core/AgentActionOperationId")
);
export type AgentActionOperationId = Schema.Schema.Type<
  typeof AgentActionOperationId
>;

export const RunAgentActionInputSchema = Schema.Struct({
  input: Schema.Unknown,
  name: AgentActionNameSchema,
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
  "action.run",
  "action.execute",
] as const;
export const AgentStorageOperation = Schema.Literal(
  ...AGENT_STORAGE_OPERATIONS
);
export type AgentStorageOperation = Schema.Schema.Type<
  typeof AgentStorageOperation
>;

export class AgentAccessDeniedError extends Schema.TaggedError<AgentAccessDeniedError>()(
  "@ceird/agents-core/AgentAccessDeniedError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 403 })
) {}

export class AgentThreadNotFoundError extends Schema.TaggedError<AgentThreadNotFoundError>()(
  "@ceird/agents-core/AgentThreadNotFoundError",
  { message: Schema.String, threadId: Schema.optional(AgentThreadId) },
  HttpApiSchema.annotations({ status: 404 })
) {}

export class AgentStorageError extends Schema.TaggedError<AgentStorageError>()(
  "@ceird/agents-core/AgentStorageError",
  { message: Schema.String, operation: AgentStorageOperation },
  HttpApiSchema.annotations({ status: 503 })
) {}

export class AgentActionRejectedError extends Schema.TaggedError<AgentActionRejectedError>()(
  "@ceird/agents-core/AgentActionRejectedError",
  {
    message: Schema.String,
    name: Schema.String,
    workItemId: Schema.optional(Schema.String),
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export const AgentThreadsApiGroup = HttpApiGroup.make("agentThreads")
  .add(
    HttpApiEndpoint.get("listAgentThreads", "/agent/threads")
      .setUrlParams(AgentThreadListQuerySchema)
      .addSuccess(AgentThreadListResponseSchema)
      .addError(AgentAccessDeniedError)
      .addError(AgentStorageError)
  )
  .add(
    HttpApiEndpoint.post("createAgentThread", "/agent/threads")
      .setPayload(CreateAgentThreadInputSchema)
      .addSuccess(AgentThreadResponseSchema, { status: 201 })
      .addError(AgentAccessDeniedError)
      .addError(AgentStorageError)
  )
  .add(
    HttpApiEndpoint.post(
      "archiveAgentThread",
      "/agent/threads/:threadId/archive"
    )
      .setPath(Schema.Struct({ threadId: AgentThreadId }))
      .addSuccess(AgentThreadResponseSchema)
      .addError(AgentAccessDeniedError)
      .addError(AgentThreadNotFoundError)
      .addError(AgentStorageError)
  )
  .add(
    HttpApiEndpoint.post(
      "authorizeAgentConnect",
      "/agent/threads/:threadId/authorize"
    )
      .setPath(Schema.Struct({ threadId: AgentThreadId }))
      .addSuccess(AgentConnectAuthorizationSchema)
      .addError(AgentAccessDeniedError)
      .addError(AgentThreadNotFoundError)
      .addError(AgentStorageError)
  );

export const AgentInternalApiGroup = HttpApiGroup.make("agentInternal")
  .add(
    HttpApiEndpoint.post(
      "touchAgentThreadActivity",
      "/agent/internal/threads/:threadId/activity"
    )
      .setPath(Schema.Struct({ threadId: AgentThreadId }))
      .addSuccess(AgentThreadResponseSchema)
      .addError(AgentAccessDeniedError)
      .addError(AgentThreadNotFoundError)
      .addError(AgentStorageError)
  )
  .add(
    HttpApiEndpoint.post("runAgentAction", "/agent/internal/actions")
      .setPayload(RunAgentActionInputSchema)
      .addSuccess(RunAgentActionResponseSchema)
      .addError(AgentAccessDeniedError)
      .addError(AgentActionRejectedError)
      .addError(AgentThreadNotFoundError)
      .addError(AgentStorageError)
  );

export function buildAgentInstanceName(input: {
  readonly organizationId: OrganizationId;
  readonly threadId: AgentThreadId;
  readonly userId: UserId;
}): AgentInstanceName {
  const raw = `org:${encodeURIComponent(input.organizationId)}:user:${encodeURIComponent(
    input.userId
  )}:thread:${input.threadId}`;

  return ParseResult.decodeUnknownSync(AgentInstanceName)(raw);
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

  return {
    organizationId: ParseResult.decodeUnknownSync(OrganizationId)(
      decodeURIComponent(match[1] ?? "")
    ),
    threadId: ParseResult.decodeUnknownSync(AgentThreadId)(match[3] ?? ""),
    userId: ParseResult.decodeUnknownSync(UserId)(
      decodeURIComponent(match[2] ?? "")
    ),
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
    return ParseResult.decodeUnknownSync(AgentConnectTokenPayloadSchema)(
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
