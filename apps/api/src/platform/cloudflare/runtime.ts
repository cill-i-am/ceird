import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { makeDomainServiceClient } from "@ceird/domain-core";
import { Effect, Schema } from "effect";

import { makeApiWebHandler } from "../../server.js";
import type { ApiWorkerEnv } from "./env.js";

const REQUEST_ID_HEADER = "x-request-id";

export class ApiDomainForwardingError extends Schema.TaggedErrorClass<ApiDomainForwardingError>()(
  "@ceird/api/DomainForwardingError",
  {
    binding: Schema.Literal("DOMAIN"),
    cause: Schema.String,
    message: Schema.String,
    method: Schema.String,
    path: Schema.String,
  }
) {}

export function handleWorkerFetch(
  request: Request,
  env: ApiWorkerEnv,
  _context: ExecutionContext
) {
  const observation = makeApiRequestObservation(request);
  const observedRequest = withRequestIdHeader(request, observation.requestId);
  const webHandler = makeApiWebHandler(makeDomainServiceClient(env.DOMAIN), {
    stackName: env.ALCHEMY_STACK_NAME,
    stage: env.ALCHEMY_STAGE,
  });

  return handleApiWorkerRequest(webHandler, observedRequest, observation).pipe(
    Effect.tap((response) =>
      Effect.annotateCurrentSpan("http.status", response.status)
    ),
    Effect.map((response) =>
      withRequestIdResponseHeader(response, observation.requestId)
    ),
    Effect.tap((response) =>
      logApiWorkerOutcome(observedRequest, env, response, observation)
    ),
    Effect.catchTag("@ceird/api/DomainForwardingError", (failure) =>
      logApiWorkerForwardingFailure(request, env, failure, observation).pipe(
        Effect.andThen(Effect.annotateCurrentSpan("http.status", 502)),
        Effect.as(
          withRequestIdResponseHeader(
            makeDomainForwardingFailureResponse(),
            observation.requestId
          )
        )
      )
    ),
    Effect.withLogSpan("api.request"),
    Effect.withSpan("ApiWorker.handleFetch", {
      attributes: makeApiRequestLogAnnotations(observedRequest, env),
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

function handleApiWorkerRequest(
  webHandler: ReturnType<typeof makeApiWebHandler>,
  request: Request,
  observation: ApiRequestObservation
) {
  return Effect.tryPromise({
    catch: (cause) =>
      new ApiDomainForwardingError({
        binding: "DOMAIN",
        cause: serializeFailureCause(cause),
        message: "API domain forwarding failed",
        method: request.method,
        path: requestPathname(request.url),
      }),
    try: async () => {
      const startedAt = nowMs();

      try {
        return await webHandler.handler(request);
      } finally {
        observation.forwardMs = elapsedMs(startedAt);
      }
    },
  });
}

function logApiWorkerOutcome(
  request: Request,
  env: ApiWorkerEnv,
  response: Response,
  observation: ApiRequestObservation
) {
  if (shouldSkipRequestLog(request)) {
    return Effect.void;
  }

  const log =
    response.status >= 500
      ? Effect.logWarning("Handled API Worker request")
      : Effect.logInfo("Handled API Worker request");

  return log.pipe(
    Effect.annotateLogs({
      ...makeApiRequestLogAnnotations(request, env, observation),
      "http.status": response.status,
    })
  );
}

function logApiWorkerForwardingFailure(
  request: Request,
  env: ApiWorkerEnv,
  failure: ApiDomainForwardingError,
  observation: ApiRequestObservation
) {
  return Effect.logWarning("API domain forwarding failed").pipe(
    Effect.annotateLogs({
      ...makeApiRequestLogAnnotations(request, env, observation),
      "api.failure": "domain_forwarding_failed",
      "api.failureBinding": failure.binding,
      "api.failureTag": failure._tag,
      "http.status": 502,
    })
  );
}

interface ApiRequestObservation {
  readonly cfRay?: string | undefined;
  forwardMs?: number | undefined;
  readonly requestId: string;
  readonly startedAtMs: number;
}

function makeApiRequestObservation(request: Request): ApiRequestObservation {
  return {
    cfRay: request.headers.get("cf-ray") ?? undefined,
    requestId: request.headers.get(REQUEST_ID_HEADER) ?? makeRequestId(),
    startedAtMs: nowMs(),
  };
}

function makeApiRequestLogAnnotations(
  request: Request,
  env: ApiWorkerEnv,
  observation?: ApiRequestObservation | undefined
) {
  return {
    ...(env.ALCHEMY_STACK_NAME === undefined
      ? {}
      : { "alchemy.stackName": env.ALCHEMY_STACK_NAME }),
    ...(env.ALCHEMY_STAGE === undefined
      ? {}
      : { "alchemy.stage": env.ALCHEMY_STAGE }),
    ...(observation?.forwardMs === undefined
      ? {}
      : { "api.forwardMs": observation.forwardMs }),
    "ceird.adapter": "api",
    "ceird.domainBinding": "DOMAIN",
    ...(observation?.requestId === undefined
      ? {}
      : { "ceird.requestId": observation.requestId }),
    ...(observation?.cfRay === undefined
      ? {}
      : { "cf.ray": observation.cfRay }),
    ...(observation?.startedAtMs === undefined
      ? {}
      : { "http.durationMs": elapsedMs(observation.startedAtMs) }),
    "http.method": request.method,
    "http.path": requestPathname(request.url),
  };
}

function shouldSkipRequestLog(request: Request) {
  return requestPathname(request.url) === "/health";
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

function withRequestIdHeader(request: Request, requestId: string) {
  if (request.headers.get(REQUEST_ID_HEADER) === requestId) {
    return request;
  }

  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);

  return new Request(request, { headers });
}

function withRequestIdResponseHeader(response: Response, requestId: string) {
  const headers = new Headers(response.headers);
  headers.set(REQUEST_ID_HEADER, requestId);

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function makeRequestId() {
  return randomUUID();
}

function nowMs() {
  return performance.now();
}

function elapsedMs(startedAt: number) {
  return Math.round((nowMs() - startedAt) * 100) / 100;
}
