import { makeDomainServiceClient } from "@ceird/domain-core";
import type { DomainHttpClient } from "@ceird/domain-core";
import {
  makeWorkerObservabilityLive,
  WorkerObservability,
} from "@ceird/worker-observability";
import { Effect, Schema } from "effect";

import type { McpWorkerEnv } from "./env.js";

const MCP_PATH = "/mcp";
const OAUTH_PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";
const MCP_PROTECTED_RESOURCE_PATH = `${OAUTH_PROTECTED_RESOURCE_PATH}${MCP_PATH}`;

export class McpDomainForwardingError extends Schema.TaggedErrorClass<McpDomainForwardingError>()(
  "@ceird/mcp/DomainForwardingError",
  {
    binding: Schema.Literal("DOMAIN"),
    cause: Schema.String,
    message: Schema.String,
    method: Schema.String,
    path: Schema.String,
  }
) {}

export function handleMcpWorkerFetch(
  request: Request,
  env: McpWorkerEnv,
  _context: ExecutionContext
) {
  const startedAt = performance.now();
  const requestId = makeRequestId();

  if (requestPathname(request.url) === "/health") {
    const response = Response.json(makeMcpHealthPayload(env));

    return recordMcpWorkerAnalytics(
      request,
      env,
      response.status,
      startedAt,
      requestId
    ).pipe(Effect.as(response));
  }

  if (!isMcpAdapterPath(request)) {
    const response = new Response(null, { status: 404 });

    return recordMcpWorkerAnalytics(
      request,
      env,
      response.status,
      startedAt,
      requestId
    ).pipe(Effect.as(response));
  }

  const domain = makeDomainServiceClient(env.DOMAIN);

  return forwardMcpRequest(domain, request).pipe(
    Effect.tap((response) =>
      Effect.annotateCurrentSpan("http.status", response.status)
    ),
    Effect.tap((response) =>
      recordMcpWorkerAnalytics(
        request,
        env,
        response.status,
        startedAt,
        requestId
      )
    ),
    Effect.tap((response) => logMcpForwardingOutcome(request, env, response)),
    Effect.catchTag("@ceird/mcp/DomainForwardingError", (failure) =>
      recordMcpWorkerAnalytics(request, env, 502, startedAt, requestId).pipe(
        Effect.andThen(logMcpForwardingFailure(request, env, failure)),
        Effect.andThen(Effect.annotateCurrentSpan("http.status", 502)),
        Effect.as(makeDomainForwardingFailureResponse())
      )
    ),
    Effect.withLogSpan("mcp.request"),
    Effect.withSpan("McpWorker.handleFetch", {
      attributes: makeMcpRequestLogAnnotations(request, env),
    })
  );
}

function recordMcpWorkerAnalytics(
  request: Request,
  env: McpWorkerEnv,
  status: number,
  startedAt: number,
  requestId: string
) {
  return WorkerObservability.recordRequest({
    adapter: "mcp",
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    method: request.method,
    path: requestPathname(request.url),
    requestId,
    status,
  }).pipe(Effect.provide(makeWorkerObservabilityLive(env)));
}

function makeRequestId() {
  const { crypto } = globalThis as { readonly crypto?: Crypto };

  return crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

const McpHealthPayload = Schema.Struct({
  ok: Schema.Literal(true),
  service: Schema.Literal("mcp"),
  stackName: Schema.String,
  stage: Schema.String,
});
type McpHealthPayload = Schema.Schema.Type<typeof McpHealthPayload>;
const decodeMcpHealthPayload = Schema.decodeUnknownSync(McpHealthPayload);

function makeDomainForwardingFailureResponse() {
  return Response.json(
    {
      error: "domain_forwarding_failed",
    },
    { status: 502 }
  );
}

function makeMcpHealthPayload(env: McpWorkerEnv) {
  return decodeMcpHealthPayload({
    ok: true,
    service: "mcp",
    stackName: runtimeIdentity(env.ALCHEMY_STACK_NAME),
    stage: runtimeIdentity(env.ALCHEMY_STAGE),
  } satisfies McpHealthPayload);
}

function runtimeIdentity(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "local";
}

function isMcpAdapterPath(request: Request) {
  const path = requestPathname(request.url);

  return (
    path === MCP_PATH ||
    path === OAUTH_PROTECTED_RESOURCE_PATH ||
    path === MCP_PROTECTED_RESOURCE_PATH
  );
}

function forwardMcpRequest(domain: DomainHttpClient, request: Request) {
  return Effect.tryPromise({
    catch: (cause) =>
      new McpDomainForwardingError({
        binding: "DOMAIN",
        cause: serializeFailureCause(cause),
        message: "MCP domain forwarding failed",
        method: request.method,
        path: requestPathname(request.url),
      }),
    try: () => domain.request(request),
  });
}

function logMcpForwardingOutcome(
  request: Request,
  env: McpWorkerEnv,
  response: Response
) {
  const log =
    response.status >= 500
      ? Effect.logWarning("Forwarded MCP request to domain Worker")
      : Effect.logInfo("Forwarded MCP request to domain Worker");

  return log.pipe(
    Effect.annotateLogs({
      ...makeMcpRequestLogAnnotations(request, env),
      "http.status": response.status,
    })
  );
}

function logMcpForwardingFailure(
  request: Request,
  env: McpWorkerEnv,
  failure: McpDomainForwardingError
) {
  return Effect.logWarning("MCP domain forwarding failed").pipe(
    Effect.annotateLogs({
      ...makeMcpRequestLogAnnotations(request, env),
      "http.status": 502,
      "mcp.failure": "domain_forwarding_failed",
      "mcp.failureBinding": failure.binding,
      "mcp.failureCause": sanitizeFailureLogText(failure.cause),
      "mcp.failureMessage": sanitizeFailureLogText(failure.message),
      "mcp.failureTag": failure._tag,
    })
  );
}

function makeMcpRequestLogAnnotations(request: Request, env: McpWorkerEnv) {
  return {
    ...(env.ALCHEMY_STACK_NAME === undefined
      ? {}
      : { "alchemy.stackName": env.ALCHEMY_STACK_NAME }),
    ...(env.ALCHEMY_STAGE === undefined
      ? {}
      : { "alchemy.stage": env.ALCHEMY_STAGE }),
    "ceird.adapter": "mcp",
    "ceird.domainBinding": "DOMAIN",
    "http.method": request.method,
    "http.path": requestPathname(request.url),
  };
}

function requestPathname(url: string) {
  const queryIndex = url.indexOf("?");
  const pathOrUrl = queryIndex === -1 ? url : url.slice(0, queryIndex);

  if (pathOrUrl.startsWith("/")) {
    return pathOrUrl;
  }

  const protocolSeparatorIndex = pathOrUrl.indexOf("://");

  if (protocolSeparatorIndex === -1) {
    return pathOrUrl;
  }

  const pathnameStartIndex = pathOrUrl.indexOf("/", protocolSeparatorIndex + 3);

  return pathnameStartIndex === -1 ? "/" : pathOrUrl.slice(pathnameStartIndex);
}

function serializeFailureCause(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

function sanitizeFailureLogText(value: string) {
  return value
    .replaceAll(
      /([?&](?:token|code|secret|password|authToken)=)[^&\s]+/giu,
      "$1<redacted>"
    )
    .replaceAll(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer <redacted>")
    .slice(0, 500);
}
