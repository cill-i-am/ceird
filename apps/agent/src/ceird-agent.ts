import {
  AgentInstanceName,
  AGENT_PROXIMITY_ORIGIN_CONTEXT_ID_BODY_KEY,
  readAgentProximityOriginContextFrame,
  readAgentProximityOriginContextIdFromBody,
} from "@ceird/agents-core/runtime";
import type {
  AgentProximityOriginContextFrame,
  AgentProximityOriginContextIdType,
} from "@ceird/agents-core/runtime";
import { AIChatAgent } from "@cloudflare/ai-chat";
import type {
  ChatRecoveryContext,
  ChatRecoveryOptions,
} from "@cloudflare/ai-chat";
import type { AgentContext, Connection } from "agents";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import type { ToolSet, UIMessage } from "ai";
import { Option, Schema } from "effect";
import { createWorkersAI } from "workers-ai-provider";

import { makeCeirdChatRecoveryOptions } from "./ceird-agent-recovery.js";
import {
  touchAgentThreadActivity,
  validateAgentCurrentLocationAccess,
} from "./domain-client.js";
import { extractAgentThreadId } from "./instance.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";
import { readAgentAiGatewayId } from "./platform/cloudflare/env.js";
import { createCeirdTools } from "./tools.js";

const DEFAULT_AGENT_MODEL = "@cf/zai-org/glm-4.7-flash";
const MAX_PENDING_PROXIMITY_ORIGINS = 20;
const PROXIMITY_ORIGIN_TTL_MS = 120_000;
const REDACTED_PROXIMITY_ORIGIN = "[redacted-proximity-origin]";
const REDACTED_PROXIMITY_COORDINATE = "[redacted-proximity-coordinate]";
const AI_CHAT_REQUEST_MESSAGE_TYPE = "cf_agent_use_chat_request";
const PROXIMITY_TOOL_MODEL_NAMES = new Set([
  "ceird.jobs.proximity",
  "ceird.jobs.route_preview",
  "ceird.sites.proximity",
  "ceird.sites.route_preview",
  "getJobRoutePreview",
  "getSiteRoutePreview",
  "rankNearbyJobs",
  "rankNearbySites",
]);
const decodeAgentInstanceName = Schema.decodeUnknownSync(AgentInstanceName);

interface PendingProximityOrigin {
  readonly origin: AgentProximityOriginContextFrame["origin"];
  readonly receivedAt: number;
}

interface ProximityTextRedactionContext {
  readonly expiresAt: number;
  readonly values: readonly string[];
}

export class CeirdAgent extends AIChatAgent<AgentWorkerEnv> {
  override chatRecovery = true;
  private readonly makeChatRecoveryOptions = makeCeirdChatRecoveryOptions;
  private readonly proximityOrigins = new Map<
    AgentProximityOriginContextIdType,
    PendingProximityOrigin
  >();
  private readonly proximityRedactionsByRequestId = new Map<
    string,
    ProximityTextRedactionContext
  >();
  private readonly proximityRedactionsByStreamId = new Map<
    string,
    ProximityTextRedactionContext
  >();
  private readonly proximityStreamIdsByRequestId = new Map<string, string>();
  private readonly proximityToolCallIdsByStreamId = new Map<
    string,
    Set<string>
  >();
  messageConcurrency = "queue" as const;
  maxPersistedMessages = 200;

  constructor(ctx: AgentContext, env: AgentWorkerEnv) {
    super(ctx, env);

    const aiChatOnMessage = this.onMessage.bind(this);
    this.onMessage = async (connection, message) => {
      if (await this.consumeProximityOriginFrame(message)) {
        return;
      }

      return aiChatOnMessage(
        connection,
        sanitizeIncomingChatRequestMessage(message)
      );
    };
  }

  override onChatRecovery(
    ctx: ChatRecoveryContext
  ): Promise<ChatRecoveryOptions> {
    return Promise.resolve(this.makeChatRecoveryOptions(ctx));
  }

  // oxlint-disable-next-line class-methods-use-this -- Framework override hook; extraction would remove the persistence extension point.
  protected override sanitizeMessageForPersistence(
    message: UIMessage
  ): UIMessage {
    const redactionValues = this.getActiveProximityTextRedactionValues();

    return {
      ...message,
      parts: message.parts.map((part) =>
        redactProximityTextPartForPersistence(
          redactProximityToolPartForPersistence(part),
          redactionValues
        )
      ),
    };
  }

  override async onMessage(
    connection: Connection,
    message: string | ArrayBuffer | ArrayBufferView
  ): Promise<void> {
    if (await this.consumeProximityOriginFrame(message)) {
      return;
    }

    return super.onMessage(connection, message);
  }

  override async onChatMessage(
    onFinish: Parameters<AIChatAgent["onChatMessage"]>[0],
    options?: Parameters<AIChatAgent["onChatMessage"]>[1]
  ) {
    const aiGatewayId = readAgentAiGatewayId(this.env);
    const workersAI = createWorkersAI({
      binding: this.env.AI,
      ...(aiGatewayId === undefined ? {} : { gateway: { id: aiGatewayId } }),
    });
    const agentInstanceName = decodeAgentInstanceName(this.name);
    const threadId = extractAgentThreadId(agentInstanceName);
    const [messages] = await Promise.all([
      convertToModelMessages(this.messages),
      touchAgentThreadActivity(this.env, threadId),
    ]);
    const proximityContextId = readAgentProximityOriginContextIdFromBody(
      options?.body
    );
    prunePendingProximityOrigins(this.proximityOrigins, Date.now());
    const proximityOrigin = Option.isSome(proximityContextId)
      ? readPendingProximityOrigin(
          this.proximityOrigins,
          proximityContextId.value
        )
      : Option.none<AgentProximityOriginContextFrame["origin"]>();
    if (Option.isSome(proximityContextId)) {
      this.proximityOrigins.delete(proximityContextId.value);
    }
    if (Option.isSome(proximityOrigin) && options?.requestId !== undefined) {
      this.proximityRedactionsByRequestId.set(
        options.requestId,
        makeProximityTextRedactionContext(proximityOrigin.value, Date.now())
      );
    }
    const tools: ToolSet = createCeirdTools(
      this.env,
      agentInstanceName,
      Option.isSome(proximityOrigin)
        ? { proximityOrigin: proximityOrigin.value }
        : undefined
    );
    const result = streamText({
      model: workersAI(this.env.AGENT_MODEL ?? DEFAULT_AGENT_MODEL, {
        sessionAffinity: this.sessionAffinity,
      }),
      messages,
      onFinish,
      stopWhen: stepCountIs(8),
      system: buildCeirdAgentSystemPrompt(proximityOrigin),
      tools,
    });

    return result.toUIMessageStreamResponse();
  }

  protected override _startStream(requestId: string): string {
    const streamId = super._startStream(requestId);
    const redactionContext = this.proximityRedactionsByRequestId.get(requestId);

    if (redactionContext !== undefined) {
      this.proximityRedactionsByStreamId.set(streamId, redactionContext);
      this.proximityStreamIdsByRequestId.set(requestId, streamId);
      this.proximityRedactionsByRequestId.delete(requestId);
    }

    return streamId;
  }

  protected override _storeStreamChunk(streamId: string, body: string): void {
    const toolCallIds =
      this.proximityToolCallIdsByStreamId.get(streamId) ?? new Set<string>();
    this.proximityToolCallIdsByStreamId.set(streamId, toolCallIds);

    super._storeStreamChunk(
      streamId,
      redactProximityStreamChunkForPersistence({
        body,
        redactionContext: this.proximityRedactionsByStreamId.get(streamId),
        toolCallIds,
      })
    );
  }

  protected override _markStreamError(streamId: string): void {
    super._markStreamError(streamId);
    this.clearProximityStreamState(streamId);
  }

  protected override onChatResponse(
    result: Parameters<AIChatAgent["onChatResponse"]>[0]
  ) {
    const streamId = this.proximityStreamIdsByRequestId.get(result.requestId);

    if (streamId !== undefined) {
      this.clearProximityStreamState(streamId);
    }
    this.proximityRedactionsByRequestId.delete(result.requestId);

    return super.onChatResponse(result);
  }

  private async consumeProximityOriginFrame(
    message: string | ArrayBuffer | ArrayBufferView
  ): Promise<boolean> {
    const frame = readAgentProximityOriginContextFrame(
      parseJsonMessage(message)
    );

    if (Option.isNone(frame)) {
      return false;
    }

    try {
      const agentInstanceName = decodeAgentInstanceName(this.name);
      const threadId = extractAgentThreadId(agentInstanceName);

      await validateAgentCurrentLocationAccess(this.env, threadId);
    } catch {
      return true;
    }

    const receivedAt = Date.now();
    prunePendingProximityOrigins(this.proximityOrigins, receivedAt);
    this.proximityOrigins.set(frame.value.contextId, {
      origin: frame.value.origin,
      receivedAt,
    });

    return true;
  }

  private clearProximityStreamState(streamId: string) {
    this.proximityRedactionsByStreamId.delete(streamId);
    this.proximityToolCallIdsByStreamId.delete(streamId);

    for (const [requestId, requestStreamId] of this
      .proximityStreamIdsByRequestId) {
      if (requestStreamId === streamId) {
        this.proximityStreamIdsByRequestId.delete(requestId);
      }
    }
  }

  private getActiveProximityTextRedactionValues() {
    const now = Date.now();
    const values = new Set<string>();

    collectActiveProximityRedactionValues(
      this.proximityRedactionsByRequestId,
      now,
      values
    );
    collectActiveProximityRedactionValues(
      this.proximityRedactionsByStreamId,
      now,
      values
    );

    return [...values];
  }
}

function sanitizeIncomingChatRequestMessage(
  message: string | ArrayBuffer | ArrayBufferView
) {
  if (typeof message !== "string") {
    return message;
  }

  const parsedMessage = parseJsonMessage(message);

  if (
    !isRecord(parsedMessage) ||
    parsedMessage.type !== AI_CHAT_REQUEST_MESSAGE_TYPE ||
    !isRecord(parsedMessage.init) ||
    parsedMessage.init.method !== "POST" ||
    typeof parsedMessage.init.body !== "string"
  ) {
    return message;
  }

  const parsedBody = parseJsonString(parsedMessage.init.body);

  if (!isRecord(parsedBody)) {
    return message;
  }

  return JSON.stringify({
    ...parsedMessage,
    init: {
      ...parsedMessage.init,
      body: JSON.stringify(sanitizeChatRequestBody(parsedBody)),
    },
  });
}

function sanitizeChatRequestBody(body: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {};

  if ("messages" in body) {
    sanitized.messages = body.messages;
  }

  if ("trigger" in body) {
    sanitized.trigger = body.trigger;
  }

  const proximityContextId = readAgentProximityOriginContextIdFromBody(body);

  if (Option.isSome(proximityContextId)) {
    sanitized[AGENT_PROXIMITY_ORIGIN_CONTEXT_ID_BODY_KEY] =
      proximityContextId.value;
  }

  return sanitized;
}

function redactProximityToolPartForPersistence(
  part: UIMessage["parts"][number]
): UIMessage["parts"][number] {
  const toolName = getToolPartName(part);

  if (toolName === null || !PROXIMITY_TOOL_MODEL_NAMES.has(toolName)) {
    return part;
  }

  if (!isRecord(part)) {
    return part;
  }

  const nextPart = { ...part };
  let changed = false;

  if ("input" in nextPart) {
    const redactedInput = redactProximityPayload(nextPart.input);
    if (redactedInput !== nextPart.input) {
      nextPart.input = redactedInput;
      changed = true;
    }
  }

  if ("output" in nextPart) {
    const redactedOutput = redactProximityPayload(nextPart.output);
    if (redactedOutput !== nextPart.output) {
      nextPart.output = redactedOutput;
      changed = true;
    }
  }

  return changed ? (nextPart as UIMessage["parts"][number]) : part;
}

function redactProximityTextPartForPersistence(
  part: UIMessage["parts"][number],
  redactionValues: readonly string[]
): UIMessage["parts"][number] {
  if (
    redactionValues.length === 0 ||
    !isRecord(part) ||
    part.type !== "text" ||
    typeof part.text !== "string"
  ) {
    return part;
  }

  const redactedText = redactSensitiveText(part.text, redactionValues);

  return redactedText === part.text ? part : { ...part, text: redactedText };
}

function redactProximityPayload(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const redacted = { ...value };
  let changed = false;

  if ("origin" in redacted) {
    redacted.origin = REDACTED_PROXIMITY_ORIGIN;
    changed = true;
  }

  if ("routeLine" in redacted) {
    redacted.routeLine = "[redacted-route-line]";
    changed = true;
  }

  if (isRecord(redacted.input)) {
    const redactedInput = redactProximityPayload(redacted.input);

    if (redactedInput !== redacted.input) {
      redacted.input = redactedInput;
      changed = true;
    }
  }

  return changed ? redacted : value;
}

function redactProximityStreamChunkForPersistence({
  body,
  redactionContext,
  toolCallIds,
}: {
  readonly body: string;
  readonly redactionContext?: ProximityTextRedactionContext | undefined;
  readonly toolCallIds: Set<string>;
}) {
  const parsed = parseJsonString(body);
  const activeRedactionValues =
    redactionContext && redactionContext.expiresAt >= Date.now()
      ? redactionContext.values
      : [];

  if (!isRecord(parsed)) {
    return redactSensitiveText(body, activeRedactionValues);
  }

  const toolName = getToolNameFromRecord(parsed);
  const toolCallId =
    typeof parsed.toolCallId === "string" ? parsed.toolCallId : null;

  if (
    toolCallId !== null &&
    toolName !== null &&
    PROXIMITY_TOOL_MODEL_NAMES.has(toolName)
  ) {
    toolCallIds.add(toolCallId);
  }

  const isProximityToolChunk =
    (toolName !== null && PROXIMITY_TOOL_MODEL_NAMES.has(toolName)) ||
    (toolCallId !== null && toolCallIds.has(toolCallId));
  let nextChunk: Record<string, unknown> = parsed;
  let changed = false;

  if (isProximityToolChunk && "input" in nextChunk) {
    const redactedInput = redactProximityPayload(nextChunk.input);

    if (redactedInput !== nextChunk.input) {
      nextChunk = { ...nextChunk, input: redactedInput };
      changed = true;
    }
  }

  if (isProximityToolChunk && "output" in nextChunk) {
    const redactedOutput = redactProximityPayload(nextChunk.output);

    if (redactedOutput !== nextChunk.output) {
      nextChunk = { ...nextChunk, output: redactedOutput };
      changed = true;
    }
  }

  const serialized = changed ? JSON.stringify(nextChunk) : body;

  return redactSensitiveText(serialized, activeRedactionValues);
}

function getToolPartName(part: UIMessage["parts"][number]) {
  if (!isRecord(part)) {
    return null;
  }

  const record = part as Record<string, unknown>;

  if (typeof record.toolName === "string") {
    return record.toolName;
  }

  if (typeof record.type === "string" && record.type.startsWith("tool-")) {
    return record.type.slice("tool-".length);
  }

  return null;
}

function getToolNameFromRecord(record: Record<string, unknown>) {
  if (typeof record.toolName === "string") {
    return record.toolName;
  }

  if (typeof record.type === "string" && record.type.startsWith("tool-")) {
    return record.type.slice("tool-".length);
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPendingProximityOrigin(
  origins: Map<AgentProximityOriginContextIdType, PendingProximityOrigin>,
  contextId: AgentProximityOriginContextIdType
) {
  const pending = origins.get(contextId);

  if (
    pending === undefined ||
    pending.receivedAt + PROXIMITY_ORIGIN_TTL_MS < Date.now()
  ) {
    return Option.none<AgentProximityOriginContextFrame["origin"]>();
  }

  return Option.some(pending.origin);
}

function prunePendingProximityOrigins(
  origins: Map<AgentProximityOriginContextIdType, PendingProximityOrigin>,
  now: number
) {
  for (const [contextId, pending] of origins) {
    if (pending.receivedAt + PROXIMITY_ORIGIN_TTL_MS < now) {
      origins.delete(contextId);
    }
  }

  while (origins.size >= MAX_PENDING_PROXIMITY_ORIGINS) {
    const oldestContextId = origins.keys().next().value;

    if (oldestContextId === undefined) {
      return;
    }

    origins.delete(oldestContextId);
  }
}

function parseJsonMessage(message: string | ArrayBuffer | ArrayBufferView) {
  if (typeof message !== "string") {
    return null;
  }

  return parseJsonString(message);
}

function parseJsonString(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function makeProximityTextRedactionContext(
  origin: AgentProximityOriginContextFrame["origin"],
  now: number
): ProximityTextRedactionContext {
  return {
    expiresAt: now + PROXIMITY_ORIGIN_TTL_MS,
    values: makeCoordinateRedactionValues(
      origin.coordinates.latitude,
      origin.coordinates.longitude
    ),
  };
}

function makeCoordinateRedactionValues(latitude: number, longitude: number) {
  return [
    ...new Set([
      String(latitude),
      String(longitude),
      latitude.toFixed(6),
      longitude.toFixed(6),
    ]),
  ]
    .filter((value) => value.length > 0)
    .toSorted((left, right) => right.length - left.length);
}

function collectActiveProximityRedactionValues(
  contexts: Map<string, ProximityTextRedactionContext>,
  now: number,
  values: Set<string>
) {
  for (const [key, context] of contexts) {
    if (context.expiresAt < now) {
      contexts.delete(key);
      continue;
    }

    for (const value of context.values) {
      values.add(value);
    }
  }
}

function redactSensitiveText(text: string, redactionValues: readonly string[]) {
  let nextText = text;

  for (const value of redactionValues) {
    nextText = nextText.split(value).join(REDACTED_PROXIMITY_COORDINATE);
  }

  return nextText;
}

function buildCeirdAgentSystemPrompt(
  proximityOrigin: Option.Option<AgentProximityOriginContextFrame["origin"]>
) {
  const basePrompt =
    "You are the Ceird agent for this organization. Use tools to inspect and change Ceird data. Prefer precise, reversible steps; summarize action results clearly after tools run.";

  if (Option.isNone(proximityOrigin)) {
    return `${basePrompt}\n\nRoute-aware proximity: use driving-time tools for nearby, closest, route, or directions questions. Do not use straight-line distance. If the user asks for "near me" and no request origin is available, ask for location access before ranking routes.`;
  }

  return `${basePrompt}\n\nRoute-aware proximity: the current request includes a hidden current-location origin from the app. Use this origin exactly when the latest user request asks for nearby jobs, nearby sites, closest results, route previews, distance, or directions. Do not ask the user to type an origin when this context is relevant. For proximity tools, send a current_location origin with placeholder coordinates { latitude: 0, longitude: 0 }; runtime will replace it with the hidden origin before calling Ceird. Do not quote raw current-location coordinates or route geometry back to the user. Rank by traffic-aware driving time, not straight-line distance. For ranked nearby lists, omit route lines and default to 10 results unless the user asks for another limit up to 25. For a specific job or site route preview, request includeRouteLine: true so the app can render the route inline.`;
}
