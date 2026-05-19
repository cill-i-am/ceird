import { makeDomainServiceClient } from "@ceird/domain-core";
import { Effect, Schema } from "effect";

import { makeApiWebHandler } from "../../server.js";
import type { ApiWorkerEnv } from "./env.js";

export class ApiDomainForwardingError extends Schema.TaggedError<ApiDomainForwardingError>()(
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
  const webHandler = makeApiWebHandler(makeDomainServiceClient(env.DOMAIN), {
    stackName: env.ALCHEMY_STACK_NAME,
    stage: env.ALCHEMY_STAGE,
  });

  return handleApiWorkerRequest(webHandler, request).pipe(
    Effect.tap((response) =>
      Effect.annotateCurrentSpan("http.status", response.status)
    ),
    Effect.tap((response) => logApiWorkerOutcome(request, env, response)),
    Effect.catchTag("@ceird/api/DomainForwardingError", (failure) =>
      logApiWorkerForwardingFailure(request, env, failure).pipe(
        Effect.zipRight(Effect.annotateCurrentSpan("http.status", 502)),
        Effect.as(makeDomainForwardingFailureResponse())
      )
    ),
    Effect.withLogSpan("api.request"),
    Effect.withSpan("ApiWorker.handleFetch", {
      attributes: makeApiRequestLogAnnotations(request, env),
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
  request: Request
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
    try: () => webHandler.handler(request),
  });
}

function logApiWorkerOutcome(
  request: Request,
  env: ApiWorkerEnv,
  response: Response
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
      ...makeApiRequestLogAnnotations(request, env),
      "http.status": response.status,
    })
  );
}

function logApiWorkerForwardingFailure(
  request: Request,
  env: ApiWorkerEnv,
  failure: ApiDomainForwardingError
) {
  return Effect.logWarning("API domain forwarding failed").pipe(
    Effect.annotateLogs({
      ...makeApiRequestLogAnnotations(request, env),
      "api.failure": "domain_forwarding_failed",
      "api.failureBinding": failure.binding,
      "api.failureTag": failure._tag,
      "http.status": 502,
    })
  );
}

function makeApiRequestLogAnnotations(request: Request, env: ApiWorkerEnv) {
  return {
    ...(env.ALCHEMY_STACK_NAME === undefined
      ? {}
      : { "alchemy.stackName": env.ALCHEMY_STACK_NAME }),
    ...(env.ALCHEMY_STAGE === undefined
      ? {}
      : { "alchemy.stage": env.ALCHEMY_STAGE }),
    "ceird.adapter": "api",
    "ceird.domainBinding": "DOMAIN",
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
