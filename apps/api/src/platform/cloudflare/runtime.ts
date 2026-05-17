import { Cause, ConfigProvider, Effect, Exit, Layer, Option } from "effect";

import { AuthEmailConfigurationError } from "../../domains/identity/authentication/auth-email-errors.js";
import {
  AuthEmailQueueDeliveryError,
  InvalidAuthEmailQueueMessageError,
  decodeAuthEmailQueueMessageEffect,
  makeCloudflareAuthenticationEmailSchedulerLive,
  sendAuthEmailQueueMessage,
} from "../../domains/identity/authentication/auth-email-queue.js";
import {
  AuthEmailSender,
  AuthEmailTransport,
} from "../../domains/identity/authentication/auth-email.js";
import {
  AuthenticationBackgroundTaskHandler,
  makeAuthenticationLive,
} from "../../domains/identity/authentication/auth.js";
import { CloudflareEmailBinding } from "../../domains/identity/authentication/cloudflare-email-binding-auth-email-transport.js";
import { SiteGeocoder } from "../../domains/sites/geocoder.js";
import { makeApiWebHandler } from "../../server.js";
import {
  makeAppDatabaseLive,
  makeAppDatabaseRuntimeLive,
} from "../database/database.js";
import type { ApiWorkerEnv } from "./env.js";
import { apiWorkerEnvConfigMap } from "./env.js";

export function makeWorkerBaseLive(env: ApiWorkerEnv) {
  return Layer.setConfigProvider(
    ConfigProvider.fromMap(apiWorkerEnvConfigMap(env))
  );
}

export const WorkerApiSiteGeocoderLive = SiteGeocoder.Google;

function makeWorkerApiHandler(env: ApiWorkerEnv, context: ExecutionContext) {
  const baseLive = makeWorkerBaseLive(env);
  const databaseRuntimeLive = makeAppDatabaseRuntimeLive(
    makeAppDatabaseLive(env.DATABASE.connectionString)
  );
  const authenticationLive = makeAuthenticationLive(
    makeCloudflareAuthenticationEmailSchedulerLive(env.AUTH_EMAIL_QUEUE),
    Layer.succeed(AuthenticationBackgroundTaskHandler, (task) => {
      context.waitUntil(task);
    })
  );

  return makeApiWebHandler(
    databaseRuntimeLive,
    authenticationLive,
    WorkerApiSiteGeocoderLive,
    baseLive
  );
}

function disposeWorkerApiHandler(
  webHandler: ReturnType<typeof makeApiWebHandler>
) {
  return Effect.promise(() => webHandler.dispose()).pipe(
    Effect.catchAllCause((cause) =>
      Effect.logWarning("Cloudflare API web handler disposal failed").pipe(
        Effect.annotateLogs({
          cloudflareWorkerFailureCause: String(Cause.squash(cause)),
        })
      )
    )
  );
}

export function handleWorkerFetch(
  request: Request,
  env: ApiWorkerEnv,
  context: ExecutionContext
) {
  return Effect.scoped(
    Effect.gen(function* CloudflareWorkerFetchRuntime() {
      const webHandler = yield* Effect.acquireRelease(
        Effect.sync(() => makeWorkerApiHandler(env, context)),
        disposeWorkerApiHandler
      );

      return yield* Effect.promise(() => webHandler.handler(request));
    })
  );
}

function makeWorkerAuthEmailTransportLive(env: ApiWorkerEnv) {
  const authEmail = env.AUTH_EMAIL;

  if (!authEmail) {
    return Layer.fail(
      new AuthEmailConfigurationError({
        message:
          "Worker auth email delivery requires the AUTH_EMAIL Worker binding",
      })
    );
  }

  const cloudflareEmailBindingLive = Layer.succeed(CloudflareEmailBinding, {
    send: (message) => authEmail.send(message),
  });

  return AuthEmailTransport.CloudflareBinding.pipe(
    Layer.provide(cloudflareEmailBindingLive)
  );
}

function makeWorkerAuthEmailSenderLive(env: ApiWorkerEnv) {
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
        ? { authEmailQueueDeliveryKey: failure.deliveryKey }
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
    Effect.exit,
    Effect.flatMap((exit) => {
      if (Exit.isSuccess(exit)) {
        return acknowledgeMessage(message);
      }

      const failure = Cause.failureOption(exit.cause);

      if (
        Option.isSome(failure) &&
        failure.value instanceof InvalidAuthEmailQueueMessageError
      ) {
        return logInvalidAuthEmailQueueMessage(failure.value).pipe(
          Effect.zipRight(acknowledgeMessage(message))
        );
      }

      if (
        Option.isSome(failure) &&
        failure.value instanceof AuthEmailQueueDeliveryError
      ) {
        return logAuthEmailQueueDeliveryError(failure.value).pipe(
          Effect.zipRight(retryMessage(message))
        );
      }

      return Effect.logError("Auth email queue handler failed with a defect")
        .pipe(
          Effect.annotateLogs({
            authEmailQueueFailureMessage: String(Cause.squash(exit.cause)),
          })
        )
        .pipe(Effect.zipRight(retryMessage(message)));
    })
  );
}

export const handleWorkerQueue = Effect.fn("CloudflareWorker.handleQueue")(
  function* (batch: MessageBatch<unknown>, env: ApiWorkerEnv) {
    yield* Effect.forEach(batch.messages, handleQueuedAuthEmailMessage, {
      discard: true,
    }).pipe(
      Effect.provide(makeWorkerAuthEmailSenderLive(env)),
      Effect.provide(makeWorkerBaseLive(env))
    );
  }
);
