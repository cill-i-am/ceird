import {
  makeWorkerObservabilityLive,
  normalizeWorkerAnalyticsPath,
  WorkerObservability,
} from "@ceird/worker-observability";
import { Effect, Schema } from "effect";

import { AgentRouteError, routeCeirdAgentRequest } from "./agent-router.js";
import {
  AgentRequestUnauthorizedError,
  authorizeAgentRequest,
} from "./instance.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";
import { readAgentAiGatewayId } from "./platform/cloudflare/env.js";

export { CeirdAgent } from "./ceird-agent.js";

const worker = {
  async fetch(request: Request, env: AgentWorkerEnv): Promise<Response> {
    const startedAt = performance.now();
    const requestId = makeRequestId();
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return withAgentAnalytics(
        Response.json(makeAgentHealthPayload(env)),
        request,
        env,
        startedAt,
        requestId
      );
    }

    if (!isAgentRoutePath(url.pathname)) {
      return withAgentAnalytics(
        new Response("Not found", { status: 404 }),
        request,
        env,
        startedAt,
        requestId
      );
    }

    if (request.method === "OPTIONS") {
      return withAgentAnalytics(
        new Response(null, {
          headers: makeCorsHeaders(request, env, { preflight: true }),
          status: 204,
        }),
        request,
        env,
        startedAt,
        requestId
      );
    }

    let authorized;

    try {
      authorized = await authorizeAgentRequest(request, env);
    } catch (error) {
      if (error instanceof AgentRequestUnauthorizedError) {
        return withAgentAnalytics(
          withCorsHeaders(
            new Response("Agent request unauthorized", { status: 401 }),
            request,
            env
          ),
          request,
          env,
          startedAt,
          requestId
        );
      }

      throw error;
    }

    try {
      const response = await routeCeirdAgentRequest(
        authorized.request,
        env,
        authorized.agentInstanceName
      );

      return withAgentAnalytics(
        withCorsHeaders(response, request, env),
        request,
        env,
        startedAt,
        requestId
      );
    } catch (error) {
      await logAgentRouteFailure(error, authorized.agentInstanceName);

      return withAgentAnalytics(
        withCorsHeaders(
          new Response("Agent route failed", { status: 500 }),
          request,
          env
        ),
        request,
        env,
        startedAt,
        requestId
      );
    }
  },
} satisfies ExportedHandler<AgentWorkerEnv>;

export default worker;

const AgentHealthPayload = Schema.Struct({
  aiGateway: Schema.optional(Schema.String),
  ok: Schema.Literal(true),
  service: Schema.Literal("agent"),
  stackName: Schema.String,
  stage: Schema.String,
});
type AgentHealthPayload = Schema.Schema.Type<typeof AgentHealthPayload>;
const decodeAgentHealthPayload = Schema.decodeUnknownSync(AgentHealthPayload);

function makeAgentHealthPayload(env: AgentWorkerEnv) {
  const aiGatewayId = readAgentAiGatewayId(env);

  return decodeAgentHealthPayload({
    ...(aiGatewayId === undefined ? {} : { aiGateway: aiGatewayId }),
    ok: true,
    service: "agent",
    stackName: runtimeIdentity(env.ALCHEMY_STACK_NAME),
    stage: runtimeIdentity(env.ALCHEMY_STAGE),
  } satisfies AgentHealthPayload);
}

function runtimeIdentity(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "local";
}

function isAgentRoutePath(pathname: string): boolean {
  return (
    pathname.startsWith("/agents/ceird-agent/") ||
    pathname.startsWith("/agents/CeirdAgent/")
  );
}

function withAgentAnalytics(
  response: Response,
  request: Request,
  env: AgentWorkerEnv,
  startedAt: number,
  requestId: string
) {
  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
  const path = new URL(request.url).pathname;

  Effect.runSync(
    WorkerObservability.recordRequest({
      adapter: "agent",
      durationMs,
      method: request.method,
      path,
      requestId,
      status: response.status,
    }).pipe(
      Effect.provide(makeWorkerObservabilityLive(env)),
      Effect.andThen(logAgentWorkerOutcome(request, env, response, durationMs)),
      Effect.withLogSpan("agent.request"),
      Effect.withSpan("AgentWorker.handleFetch", {
        attributes: makeAgentRequestLogAnnotations(request, env),
      })
    )
  );

  return response;
}

function makeRequestId() {
  const { crypto } = globalThis as { readonly crypto?: Crypto };

  return crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function logAgentWorkerOutcome(
  request: Request,
  env: AgentWorkerEnv,
  response: Response,
  durationMs: number
) {
  const log =
    response.status >= 500
      ? Effect.logWarning("Handled Agent Worker request")
      : Effect.logInfo("Handled Agent Worker request");

  return log.pipe(
    Effect.annotateLogs({
      ...makeAgentRequestLogAnnotations(request, env),
      "http.durationMs": durationMs,
      "http.status": response.status,
    })
  );
}

function makeAgentRequestLogAnnotations(request: Request, env: AgentWorkerEnv) {
  return {
    ...(env.ALCHEMY_STACK_NAME === undefined
      ? {}
      : { "alchemy.stackName": env.ALCHEMY_STACK_NAME }),
    ...(env.ALCHEMY_STAGE === undefined
      ? {}
      : { "alchemy.stage": env.ALCHEMY_STAGE }),
    "ceird.adapter": "agent",
    "http.method": request.method,
    "http.path": normalizeWorkerAnalyticsPath(new URL(request.url).pathname),
  };
}

async function logAgentRouteFailure(error: unknown, agentInstanceName: string) {
  const annotations =
    error instanceof AgentRouteError
      ? {
          agentInstanceName: error.agentInstanceName,
          agentNamespace: error.namespace,
          agentRouteFailureCause: error.cause,
          agentRouteFailureMessage: error.message,
          agentRouteFailureTag: error._tag,
          "http.path": error.path,
        }
      : {
          agentInstanceName,
          agentRouteFailureCause:
            error instanceof Error ? error.message : String(error),
          agentRouteFailureTag:
            error instanceof Error ? error.name : typeof error,
        };

  await Effect.runPromise(
    Effect.logError("Agent route failed").pipe(Effect.annotateLogs(annotations))
  );
}

function withCorsHeaders(
  response: Response,
  request: Request,
  env: AgentWorkerEnv
): Response {
  const corsHeaders = makeCorsHeaders(request, env);

  if (corsHeaders === undefined) {
    return response;
  }

  const mutableResponse = makeResponseHeadersMutable(response);

  for (const [key, value] of corsHeaders) {
    mutableResponse.headers.set(key, value);
  }

  return mutableResponse;
}

function makeResponseHeadersMutable(response: Response): Response {
  const testHeader = "x-ceird-agent-header-mutability-check";

  try {
    response.headers.set(testHeader, "1");
    response.headers.delete(testHeader);

    return response;
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }
  }

  return new Response(response.body, {
    cf: response.cf,
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
    webSocket: response.webSocket,
  });
}

function makeCorsHeaders(
  request: Request,
  env: AgentWorkerEnv,
  options: { readonly preflight?: boolean } = {}
): Headers | undefined {
  const origin = request.headers.get("origin");

  if (
    origin === null ||
    !matchesTrustedOrigin(origin, getTrustedOrigins(env))
  ) {
    return undefined;
  }

  const headers = new Headers({
    "access-control-allow-credentials": "true",
    "access-control-allow-origin": origin,
    vary: "Origin",
  });

  if (options.preflight === true) {
    headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    headers.set(
      "access-control-allow-headers",
      request.headers.get("access-control-request-headers") ??
        "authorization, content-type"
    );
    headers.set("vary", "Origin, Access-Control-Request-Headers");
  }

  return headers;
}

function getTrustedOrigins(env: AgentWorkerEnv): readonly string[] {
  const origins = new Set<string>();

  for (const origin of (env.AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)) {
    origins.add(origin);
  }

  if (env.AUTH_APP_ORIGIN !== undefined) {
    origins.add(env.AUTH_APP_ORIGIN);
  }

  return [...origins];
}

function matchesTrustedOrigin(
  origin: string,
  trustedOrigins: readonly string[]
) {
  return trustedOrigins.some((pattern) => {
    if (!pattern.includes("*") && !pattern.includes("?")) {
      return pattern === origin;
    }

    const escapedPattern = pattern.replaceAll(/[.+^${}()|[\]\\]/g, "\\$&");
    const matcher = escapedPattern
      .replaceAll("*", "[^.]+")
      .replaceAll("?", "[^.]");

    return new RegExp(`^${matcher}$`).test(origin);
  });
}
