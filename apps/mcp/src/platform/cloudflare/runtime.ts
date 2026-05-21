import { makeDomainServiceClient } from "@ceird/domain-core";
import type { DomainHttpClient } from "@ceird/domain-core";
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
  if (!isMcpAdapterPath(request)) {
    return Effect.succeed(new Response(null, { status: 404 }));
  }

  const domain = makeDomainServiceClient(env.DOMAIN);

  return forwardMcpRequest(domain, request).pipe(
    Effect.tap((response) =>
      Effect.annotateCurrentSpan("http.status", response.status)
    ),
    Effect.tap((response) => logMcpForwardingOutcome(request, env, response)),
    Effect.catchTag("@ceird/mcp/DomainForwardingError", (failure) =>
      logMcpForwardingFailure(request, env, failure).pipe(
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

function makeDomainForwardingFailureResponse() {
  return Response.json(
    {
      error: "domain_forwarding_failed",
    },
    { status: 502 }
  );
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
