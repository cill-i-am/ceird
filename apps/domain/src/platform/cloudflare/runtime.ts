import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { Cause, ConfigProvider, Effect, Layer, Schema } from "effect";

import { AuthEmailConfigurationError } from "../../domains/identity/authentication/auth-email-errors.js";
import type {
  AuthEmailQueueDeliveryError,
  InvalidAuthEmailQueueMessageError,
} from "../../domains/identity/authentication/auth-email-queue.js";
import {
  AUTH_EMAIL_QUEUE_DELIVERY_ERROR_TAG,
  decodeAuthEmailQueueMessageEffect,
  INVALID_AUTH_EMAIL_QUEUE_MESSAGE_ERROR_TAG,
  makeCloudflareAuthenticationEmailSchedulerLive,
  sendAuthEmailQueueMessage,
} from "../../domains/identity/authentication/auth-email-queue.js";
import {
  fingerprintDeliveryKey,
  sanitizeProviderErrorMessage,
} from "../../domains/identity/authentication/auth-email-transport-helpers.js";
import {
  AuthEmailSender,
  AuthEmailTransport,
} from "../../domains/identity/authentication/auth-email.js";
import {
  makeAuthenticationRequestObservation,
  readCurrentAuthenticationRequestObservation,
  runWithAuthenticationRequestObservation,
} from "../../domains/identity/authentication/auth-observability.js";
import type { AuthenticationRequestObservation } from "../../domains/identity/authentication/auth-observability.js";
import {
  AuthenticationBackgroundTaskHandler,
  makeAuthenticationLive,
} from "../../domains/identity/authentication/auth.js";
import { CloudflareEmailBinding } from "../../domains/identity/authentication/cloudflare-email-binding-auth-email-transport.js";
import type { McpAuthorizedAppCacheOptions } from "../../domains/mcp/cache-config.js";
import { loadMcpAuthorizedAppCacheOptions } from "../../domains/mcp/cache-config.js";
import type { McpAuthorizedAppCache } from "../../domains/mcp/http.js";
import { makeMcpAuthorizedAppCache } from "../../domains/mcp/http.js";
import { SiteLocationProvider } from "../../domains/sites/location-provider.js";
import { makeApiWebHandler } from "../../server.js";
import {
  makeAppDatabaseLive,
  makeAppDatabaseRuntimeLive,
} from "../database/database.js";
import {
  makePlatformRequestLogAnnotations,
  makePlatformRequestObservation,
  readCurrentPlatformRequestObservation,
  runWithPlatformRequestObservation,
} from "../request-observability.js";
import type { PlatformRequestObservation } from "../request-observability.js";
import type { DomainWorkerEnv } from "./env.js";
import { domainWorkerEnvConfigMap } from "./env.js";

const REQUEST_ID_HEADER = "x-request-id";

export class DomainWorkerFetchError extends Schema.TaggedErrorClass<DomainWorkerFetchError>()(
  "@ceird/domain/WorkerFetchError",
  {
    cause: Schema.String,
    message: Schema.String,
    method: Schema.String,
    path: Schema.String,
  }
) {}

const domainWorkerExecutionContext = new AsyncLocalStorage<ExecutionContext>();
const domainWorkerMcpAuthorizedAppCaches = new Map<
  string,
  McpAuthorizedAppCache
>();

export function makeWorkerBaseLive(env: DomainWorkerEnv) {
  return ConfigProvider.layer(
    ConfigProvider.fromEnv({
      env: Object.fromEntries(domainWorkerEnvConfigMap(env)),
    })
  );
}

export const DomainWorkerSiteLocationProviderLive = SiteLocationProvider.Google;

export function makeWorkerAuthenticationBackgroundTaskHandlerLive() {
  return Layer.succeed(AuthenticationBackgroundTaskHandler, (task) => {
    const authenticationObservation =
      readCurrentAuthenticationRequestObservation();
    const platformObservation = readCurrentPlatformRequestObservation();
    const startedAt = nowMs();
    const backgroundTask = (async () => {
      try {
        await task;
        await Effect.runPromise(
          Effect.logInfo("Authentication background task completed").pipe(
            Effect.annotateLogs({
              ...makeOptionalPlatformRequestLogAnnotations(platformObservation),
              "auth.backgroundTaskMs": elapsedMs(startedAt),
              ...authenticationObservation?.timings,
            })
          )
        );
      } catch (error) {
        await Effect.runPromise(
          Effect.logError("Authentication background task failed").pipe(
            Effect.annotateLogs({
              ...makeOptionalPlatformRequestLogAnnotations(platformObservation),
              "auth.backgroundTaskMs": elapsedMs(startedAt),
              ...authenticationObservation?.timings,
              authenticationBackgroundTaskFailureCause:
                serializeFailureCause(error),
            })
          )
        );
      }
    })();
    const context = domainWorkerExecutionContext.getStore();

    if (context === undefined) {
      queueMicrotask(() => {
        void backgroundTask;
      });
      return;
    }

    context.waitUntil(backgroundTask);
  });
}

export function makeDomainWorkerRuntimeLayers(env: DomainWorkerEnv) {
  const baseLive = makeWorkerBaseLive(env);
  const databaseRuntimeLive = makeAppDatabaseRuntimeLive(
    makeAppDatabaseLive(env.DATABASE.connectionString)
  );
  const authenticationLive = makeAuthenticationLive(
    makeCloudflareAuthenticationEmailSchedulerLive(env.AUTH_EMAIL_QUEUE),
    makeWorkerAuthenticationBackgroundTaskHandlerLive()
  );

  return {
    authenticationLive,
    baseLive,
    databaseRuntimeLive,
    siteLocationProviderLive: DomainWorkerSiteLocationProviderLive,
  };
}

function makeDomainWorkerHandler(env: DomainWorkerEnv) {
  const {
    authenticationLive,
    baseLive,
    databaseRuntimeLive,
    siteLocationProviderLive,
  } = makeDomainWorkerRuntimeLayers(env);

  return makeApiWebHandler({
    authenticationLive,
    baseLive,
    databaseRuntimeLive,
    siteLocationProviderLive,
    mcpAuthorizedAppCache: getDomainWorkerMcpAuthorizedAppCache(baseLive),
  });
}

export function getDomainWorkerMcpAuthorizedAppCache(
  baseLive: Layer.Layer<never, never, never>
) {
  const options = Effect.runSync(
    loadMcpAuthorizedAppCacheOptions.pipe(Effect.provide(baseLive))
  );
  const cacheKey = makeDomainWorkerMcpAuthorizedAppCacheKey(options);
  const existing = domainWorkerMcpAuthorizedAppCaches.get(cacheKey);

  if (existing !== undefined) {
    return existing;
  }

  const cache = makeMcpAuthorizedAppCache(options);
  domainWorkerMcpAuthorizedAppCaches.set(cacheKey, cache);
  return cache;
}

function makeDomainWorkerMcpAuthorizedAppCacheKey(
  options: McpAuthorizedAppCacheOptions
) {
  return `${options.maxEntries ?? "default"}:${options.ttlMs ?? "default"}`;
}

export function disposeDomainWorkerHandler(
  webHandler: ReturnType<typeof makeApiWebHandler>
) {
  return Effect.promise(() => webHandler.dispose()).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("Cloudflare domain web handler disposal failed").pipe(
        Effect.annotateLogs({
          cloudflareWorkerFailure: "web_handler_disposal_failed",
          cloudflareWorkerFailureCause: sanitizeProviderErrorMessage(
            serializeFailureCause(Cause.squash(cause))
          ),
          cloudflareWorkerFailureCauseType: typeof Cause.squash(cause),
        })
      )
    )
  );
}

function makeDomainWorkerHandlerEffect(
  request: Request,
  env: DomainWorkerEnv,
  observation: DomainWorkerRequestObservation
) {
  return Effect.try({
    catch: (cause) =>
      new DomainWorkerFetchError({
        cause: serializeFailureCause(cause),
        message: "Failed to create domain Worker web handler",
        method: request.method,
        path: requestPathname(request.url),
      }),
    try: () => {
      const startedAt = nowMs();

      try {
        return makeDomainWorkerHandler(env);
      } finally {
        observation.handlerInitMs = elapsedMs(startedAt);
      }
    },
  });
}

export function runWithDomainWorkerExecutionContext<T>(
  context: ExecutionContext,
  evaluate: () => T
) {
  return domainWorkerExecutionContext.run(context, evaluate);
}

export function handleWorkerFetch(
  request: Request,
  env: DomainWorkerEnv,
  context: ExecutionContext
) {
  const observation = makeDomainWorkerRequestObservation(request);
  const observedRequest = withRequestIdHeader(request, observation.requestId);

  return Effect.acquireUseRelease(
    makeDomainWorkerHandlerEffect(observedRequest, env, observation),
    (webHandler) =>
      Effect.tryPromise({
        catch: (cause) =>
          new DomainWorkerFetchError({
            cause: serializeFailureCause(cause),
            message: "Domain Worker request handling failed",
            method: request.method,
            path: requestPathname(request.url),
          }),
        try: async () => {
          const startedAt = nowMs();

          try {
            return await runWithDomainWorkerExecutionContext(context, () =>
              runWithPlatformRequestObservation(observation.platform, () =>
                runWithAuthenticationRequestObservation(
                  observation.authentication,
                  () => webHandler.handler(observedRequest)
                )
              )
            );
          } finally {
            observation.handlerMs = elapsedMs(startedAt);
          }
        },
      }),
    disposeDomainWorkerHandler
  ).pipe(
    Effect.catchTag("@ceird/domain/WorkerFetchError", (failure) =>
      logDomainWorkerFetchFailure(env, failure, observation).pipe(
        Effect.as(
          withRequestIdResponseHeader(
            Response.json(
              {
                error: "domain_worker_failed",
              },
              { status: 500 }
            ),
            observation.requestId
          )
        )
      )
    ),
    Effect.tap((response) =>
      Effect.annotateCurrentSpan("http.status", response.status)
    ),
    Effect.map((response) =>
      withRequestIdResponseHeader(response, observation.requestId)
    ),
    Effect.tap((response) =>
      logDomainWorkerFetchOutcome(observedRequest, env, response, observation)
    ),
    Effect.annotateLogs(
      makeDomainWorkerFetchAnnotations(observedRequest, env, observation)
    ),
    Effect.withLogSpan("domain.request"),
    Effect.withSpan("DomainWorker.handleFetch", {
      attributes: makeDomainWorkerFetchAnnotations(observedRequest, env),
    })
  );
}

function logDomainWorkerFetchOutcome(
  request: Request,
  env: DomainWorkerEnv,
  response: Response,
  observation: DomainWorkerRequestObservation
) {
  if (requestPathname(request.url) === "/health") {
    return Effect.void;
  }

  const log =
    response.status >= 500
      ? Effect.logWarning("Handled domain Worker request")
      : Effect.logInfo("Handled domain Worker request");

  return log.pipe(
    Effect.annotateLogs({
      ...makeDomainWorkerFetchAnnotations(request, env, observation),
      "http.status": response.status,
    })
  );
}

function logDomainWorkerFetchFailure(
  env: DomainWorkerEnv,
  failure: DomainWorkerFetchError,
  observation: DomainWorkerRequestObservation
) {
  return Effect.logError("Domain Worker request failed").pipe(
    Effect.annotateLogs({
      ...(env.ALCHEMY_STACK_NAME === undefined
        ? {}
        : { "alchemy.stackName": env.ALCHEMY_STACK_NAME }),
      ...(env.ALCHEMY_STAGE === undefined
        ? {}
        : { "alchemy.stage": env.ALCHEMY_STAGE }),
      "ceird.adapter": "domain",
      ...makePlatformRequestLogAnnotations(observation.platform),
      "domain.failure": "domain_worker_failed",
      "domain.failureTag": failure._tag,
      ...makeDomainWorkerTimingAnnotations(observation),
      "http.method": failure.method,
      "http.path": failure.path,
      "http.status": 500,
    })
  );
}

function makeDomainWorkerFetchAnnotations(
  request: Request,
  env: DomainWorkerEnv,
  observation?: DomainWorkerRequestObservation | undefined
) {
  return {
    ...(env.ALCHEMY_STACK_NAME === undefined
      ? {}
      : { "alchemy.stackName": env.ALCHEMY_STACK_NAME }),
    ...(env.ALCHEMY_STAGE === undefined
      ? {}
      : { "alchemy.stage": env.ALCHEMY_STAGE }),
    "ceird.adapter": "domain",
    ...(observation === undefined
      ? {}
      : makePlatformRequestLogAnnotations(observation.platform)),
    ...(observation === undefined
      ? {}
      : makeDomainWorkerTimingAnnotations(observation)),
    "http.method": request.method,
    "http.path": requestPathname(request.url),
  };
}

interface DomainWorkerRequestObservation {
  readonly authentication: AuthenticationRequestObservation;
  readonly cfRay?: string | undefined;
  handlerInitMs?: number | undefined;
  handlerMs?: number | undefined;
  readonly platform: PlatformRequestObservation;
  readonly requestId: string;
  readonly startedAtMs: number;
}

function makeDomainWorkerRequestObservation(
  request: Request
): DomainWorkerRequestObservation {
  const cfRay = request.headers.get("cf-ray") ?? undefined;
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? makeRequestId();

  return {
    authentication: makeAuthenticationRequestObservation(),
    cfRay,
    platform: makePlatformRequestObservation({
      cfRay,
      requestId,
    }),
    requestId,
    startedAtMs: nowMs(),
  };
}

function makeDomainWorkerTimingAnnotations(
  observation: DomainWorkerRequestObservation
) {
  return {
    ...(observation.handlerInitMs === undefined
      ? {}
      : { "domain.handlerInitMs": observation.handlerInitMs }),
    ...(observation.handlerMs === undefined
      ? {}
      : { "domain.handlerMs": observation.handlerMs }),
    "http.durationMs": elapsedMs(observation.startedAtMs),
    ...observation.platform.annotations,
    ...observation.authentication.timings,
  };
}

function makeOptionalPlatformRequestLogAnnotations(
  observation: PlatformRequestObservation | undefined
) {
  return observation === undefined
    ? {}
    : makePlatformRequestLogAnnotations(observation);
}

function makeWorkerAuthEmailTransportLive(env: DomainWorkerEnv) {
  const authEmail = env.AUTH_EMAIL;

  if (!authEmail) {
    return Layer.effect(
      AuthEmailTransport,
      Effect.fail(
        new AuthEmailConfigurationError({
          message:
            "Worker auth email delivery requires the AUTH_EMAIL Worker binding",
        })
      )
    );
  }

  const cloudflareEmailBindingLive = Layer.succeed(CloudflareEmailBinding, {
    send: (message) => authEmail.send(message),
  });

  return AuthEmailTransport.CloudflareBinding.pipe(
    Layer.provide(cloudflareEmailBindingLive)
  );
}

function makeWorkerAuthEmailSenderLive(env: DomainWorkerEnv) {
  return AuthEmailSender.Default.pipe(
    Layer.provideMerge(makeWorkerAuthEmailTransportLive(env))
  );
}

function sendQueuedAuthEmail(body: unknown) {
  return decodeAuthEmailQueueMessageEffect(body).pipe(
    Effect.flatMap(sendAuthEmailQueueMessage)
  );
}

function acknowledgeMessage(message: Message<unknown>) {
  return Effect.sync(() => {
    message.ack();
  });
}

function retryMessage(message: Message<unknown>) {
  return Effect.sync(() => {
    message.retry({ delaySeconds: 30 });
  });
}

function logInvalidAuthEmailQueueMessage(
  failure: InvalidAuthEmailQueueMessageError
) {
  return Effect.logWarning("Invalid auth email queue message discarded").pipe(
    Effect.annotateLogs({
      authEmailQueueFailureCause: failure.cause,
      ...(failure.inputKind
        ? { authEmailQueueMessageKind: failure.inputKind }
        : {}),
      authEmailQueueFailureMessage: failure.message,
      authEmailQueueFailureTag: failure._tag,
    })
  );
}

function logAuthEmailQueueDeliveryError(failure: AuthEmailQueueDeliveryError) {
  return Effect.logWarning("Auth email queue delivery failed; retrying").pipe(
    Effect.annotateLogs({
      ...(failure.cause ? { authEmailQueueFailureCause: failure.cause } : {}),
      ...(failure.deliveryKey
        ? {
            authEmailQueueDeliveryKeyFingerprint: fingerprintDeliveryKey(
              failure.deliveryKey
            ),
          }
        : {}),
      ...(failure.emailKind
        ? { authEmailQueueEmailKind: failure.emailKind }
        : {}),
      authEmailQueueFailureMessage: failure.message,
      ...(failure.sourceCause
        ? {
            authEmailQueueFailureSourceCause: failure.sourceCause,
          }
        : {}),
      ...(failure.sourceTag
        ? { authEmailQueueFailureSourceTag: failure.sourceTag }
        : {}),
      authEmailQueueFailureTag: failure._tag,
    })
  );
}

function handleQueuedAuthEmailMessage(message: Message<unknown>) {
  return sendQueuedAuthEmail(message.body).pipe(
    Effect.andThen(acknowledgeMessage(message)),
    Effect.catchTag(AUTH_EMAIL_QUEUE_DELIVERY_ERROR_TAG, (failure) =>
      logAuthEmailQueueDeliveryError(failure).pipe(
        Effect.andThen(retryMessage(message))
      )
    ),
    Effect.catchTag(INVALID_AUTH_EMAIL_QUEUE_MESSAGE_ERROR_TAG, (failure) =>
      logInvalidAuthEmailQueueMessage(failure).pipe(
        Effect.andThen(acknowledgeMessage(message))
      )
    ),
    Effect.tapCause((cause) =>
      Effect.logError("Auth email queue handler failed with a defect").pipe(
        Effect.annotateLogs({
          authEmailQueueFailureMessage: String(Cause.squash(cause)),
        })
      )
    )
  );
}

export const handleWorkerQueue = Effect.fn("CloudflareWorker.handleQueue")(
  function* (batch: MessageBatch<unknown>, env: DomainWorkerEnv) {
    yield* Effect.annotateCurrentSpan(
      "authEmailQueueMessageCount",
      batch.messages.length
    );

    yield* Effect.forEach(batch.messages, handleQueuedAuthEmailMessage, {
      concurrency: 4,
      discard: true,
    }).pipe(
      Effect.annotateLogs({
        authEmailQueueMessageCount: batch.messages.length,
      }),
      Effect.provide(makeWorkerAuthEmailSenderLive(env)),
      Effect.provide(makeWorkerBaseLive(env))
    );
  }
);

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
  return sanitizeProviderErrorMessage(
    cause instanceof Error ? cause.message : String(cause)
  );
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
