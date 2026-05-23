import { AsyncLocalStorage } from "node:async_hooks";

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
  AuthenticationBackgroundTaskHandler,
  makeAuthenticationLive,
} from "../../domains/identity/authentication/auth.js";
import { CloudflareEmailBinding } from "../../domains/identity/authentication/cloudflare-email-binding-auth-email-transport.js";
import type { McpAuthorizedAppCacheOptions } from "../../domains/mcp/cache-config.js";
import { loadMcpAuthorizedAppCacheOptions } from "../../domains/mcp/cache-config.js";
import type { McpAuthorizedAppCache } from "../../domains/mcp/http.js";
import { makeMcpAuthorizedAppCache } from "../../domains/mcp/http.js";
import { SiteGeocoder } from "../../domains/sites/geocoder.js";
import { makeApiWebHandler } from "../../server.js";
import {
  makeAppDatabaseLive,
  makeAppDatabaseRuntimeLive,
} from "../database/database.js";
import type { DomainWorkerEnv } from "./env.js";
import { domainWorkerEnvConfigMap } from "./env.js";

type DomainWorkerWebHandler = ReturnType<typeof makeApiWebHandler>;
type DomainWorkerHandlerFactory = (
  env: DomainWorkerEnv
) => DomainWorkerWebHandler;

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
const domainWorkerWebHandlers = new Map<
  string,
  Promise<DomainWorkerWebHandler>
>();

export function makeWorkerBaseLive(env: DomainWorkerEnv) {
  return ConfigProvider.layer(
    ConfigProvider.fromEnv({
      env: Object.fromEntries(domainWorkerEnvConfigMap(env)),
    })
  );
}

export const DomainWorkerSiteGeocoderLive = SiteGeocoder.Google;

export function makeWorkerAuthenticationBackgroundTaskHandlerLive() {
  return Layer.succeed(AuthenticationBackgroundTaskHandler, (task) => {
    const backgroundTask = (async () => {
      try {
        await task;
      } catch (error) {
        await Effect.runPromise(
          Effect.logError("Authentication background task failed").pipe(
            Effect.annotateLogs({
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
    siteGeocoderLive: DomainWorkerSiteGeocoderLive,
  };
}

function makeDomainWorkerHandler(env: DomainWorkerEnv) {
  const {
    authenticationLive,
    baseLive,
    databaseRuntimeLive,
    siteGeocoderLive,
  } = makeDomainWorkerRuntimeLayers(env);

  return makeApiWebHandler({
    authenticationLive,
    baseLive,
    databaseRuntimeLive,
    siteGeocoderLive,
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

function makeDomainWorkerHandlerCacheKey(env: DomainWorkerEnv) {
  return JSON.stringify({
    database: env.DATABASE.connectionString,
    config: [...domainWorkerEnvConfigMap(env)].toSorted(([left], [right]) =>
      left.localeCompare(right)
    ),
  });
}

export function getDomainWorkerHandler(
  env: DomainWorkerEnv,
  makeHandler: DomainWorkerHandlerFactory = makeDomainWorkerHandler
): Promise<DomainWorkerWebHandler> {
  const cacheKey = makeDomainWorkerHandlerCacheKey(env);
  const cachedHandler = domainWorkerWebHandlers.get(cacheKey);

  if (cachedHandler !== undefined) {
    return cachedHandler;
  }

  const handler = makeDomainWorkerHandlerPromise(env, makeHandler);
  domainWorkerWebHandlers.set(cacheKey, handler);
  void evictFailedDomainWorkerHandler(cacheKey, handler);

  return handler;
}

function makeDomainWorkerHandlerPromise(
  env: DomainWorkerEnv,
  makeHandler: DomainWorkerHandlerFactory
) {
  try {
    return Promise.resolve(makeHandler(env));
  } catch (error) {
    return Promise.reject(error);
  }
}

async function evictFailedDomainWorkerHandler(
  cacheKey: string,
  handler: Promise<DomainWorkerWebHandler>
) {
  try {
    await handler;
  } catch {
    if (domainWorkerWebHandlers.get(cacheKey) === handler) {
      domainWorkerWebHandlers.delete(cacheKey);
    }
  }
}

export async function disposeCachedDomainWorkerHandlersForTest() {
  const handlers = [...new Set(domainWorkerWebHandlers.values())];

  domainWorkerWebHandlers.clear();

  await Promise.all(
    handlers.map(async (handlerPromise) => {
      try {
        const handler = await handlerPromise;
        await handler.dispose();
      } catch {
        // Failed initialization attempts have no handler to dispose.
      }
    })
  );
}

export function disposeDomainWorkerHandler(webHandler: DomainWorkerWebHandler) {
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

function getDomainWorkerHandlerEffect(request: Request, env: DomainWorkerEnv) {
  return Effect.tryPromise({
    catch: (cause) =>
      new DomainWorkerFetchError({
        cause: serializeFailureCause(cause),
        message: "Failed to create domain Worker web handler",
        method: request.method,
        path: requestPathname(request.url),
      }),
    try: () => getDomainWorkerHandler(env),
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
  return Effect.flatMap(
    getDomainWorkerHandlerEffect(request, env),
    (webHandler) =>
      Effect.tryPromise({
        catch: (cause) =>
          new DomainWorkerFetchError({
            cause: serializeFailureCause(cause),
            message: "Domain Worker request handling failed",
            method: request.method,
            path: requestPathname(request.url),
          }),
        try: () =>
          runWithDomainWorkerExecutionContext(context, () =>
            webHandler.handler(request)
          ),
      })
  ).pipe(
    Effect.catchTag("@ceird/domain/WorkerFetchError", (failure) =>
      logDomainWorkerFetchFailure(env, failure).pipe(
        Effect.as(
          Response.json(
            {
              error: "domain_worker_failed",
            },
            { status: 500 }
          )
        )
      )
    ),
    Effect.tap((response) =>
      Effect.annotateCurrentSpan("http.status", response.status)
    ),
    Effect.tap((response) =>
      logDomainWorkerFetchOutcome(request, env, response)
    ),
    Effect.withLogSpan("domain.request"),
    Effect.withSpan("DomainWorker.handleFetch", {
      attributes: makeDomainWorkerFetchAnnotations(request, env),
    })
  );
}

function logDomainWorkerFetchOutcome(
  request: Request,
  env: DomainWorkerEnv,
  response: Response
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
      ...makeDomainWorkerFetchAnnotations(request, env),
      "http.status": response.status,
    })
  );
}

function logDomainWorkerFetchFailure(
  env: DomainWorkerEnv,
  failure: DomainWorkerFetchError
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
      "domain.failure": "domain_worker_failed",
      "domain.failureTag": failure._tag,
      "http.method": failure.method,
      "http.path": failure.path,
      "http.status": 500,
    })
  );
}

function makeDomainWorkerFetchAnnotations(
  request: Request,
  env: DomainWorkerEnv
) {
  return {
    ...(env.ALCHEMY_STACK_NAME === undefined
      ? {}
      : { "alchemy.stackName": env.ALCHEMY_STACK_NAME }),
    ...(env.ALCHEMY_STAGE === undefined
      ? {}
      : { "alchemy.stage": env.ALCHEMY_STAGE }),
    "ceird.adapter": "domain",
    "http.method": request.method,
    "http.path": requestPathname(request.url),
  };
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
  return cause instanceof Error ? cause.message : String(cause);
}
