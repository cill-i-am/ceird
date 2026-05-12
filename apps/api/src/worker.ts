import {
  Cause,
  ConfigProvider,
  Effect,
  Exit,
  Layer,
  Match,
  Option,
} from "effect";

import { loadAuthEmailConfig } from "./domains/identity/authentication/auth-email-config.js";
import { AuthEmailConfigurationError } from "./domains/identity/authentication/auth-email-errors.js";
import { NoopAuthEmailTransportLive } from "./domains/identity/authentication/auth-email-promise-bridge.js";
import {
  AuthEmailQueueDeliveryError,
  InvalidAuthEmailQueueMessageError,
  decodeAuthEmailQueueMessageEffect,
  makeCloudflareAuthenticationEmailSchedulerLive,
  sendAuthEmailQueueMessage,
} from "./domains/identity/authentication/auth-email-queue.js";
import { AuthEmailSender } from "./domains/identity/authentication/auth-email.js";
import {
  AuthenticationBackgroundTaskHandler,
  makeAuthenticationLive,
} from "./domains/identity/authentication/auth.js";
import { CloudflareAuthEmailTransportLive } from "./domains/identity/authentication/cloudflare-auth-email-transport.js";
import {
  CloudflareEmailBinding,
  CloudflareEmailBindingAuthEmailTransportLive,
} from "./domains/identity/authentication/cloudflare-email-binding-auth-email-transport.js";
import { SiteGeocoder } from "./domains/sites/geocoder.js";
import type { ApiWorkerEnv } from "./platform/cloudflare/env.js";
import { apiWorkerEnvConfigMap } from "./platform/cloudflare/env.js";
import {
  makeAppDatabaseLive,
  makeAppDatabaseRuntimeLive,
} from "./platform/database/database.js";
import { makeApiWebHandler } from "./server.js";

function makeWorkerBaseLive(env: ApiWorkerEnv) {
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

function makeWorkerAuthEmailTransportLive(env: ApiWorkerEnv) {
  return Layer.unwrapEffect(
    loadAuthEmailConfig.pipe(
      Effect.map(({ transportMode }) =>
        Match.value(transportMode).pipe(
          Match.when("noop", () => NoopAuthEmailTransportLive),
          Match.when("cloudflare-api", () => CloudflareAuthEmailTransportLive),
          Match.when("cloudflare-binding", () => {
            const authEmail = env.AUTH_EMAIL;

            if (!authEmail) {
              return Layer.fail(
                new AuthEmailConfigurationError({
                  message:
                    "AUTH_EMAIL_TRANSPORT=cloudflare-binding requires the AUTH_EMAIL Worker binding",
                })
              );
            }

            const cloudflareEmailBindingLive = Layer.succeed(
              CloudflareEmailBinding,
              {
                send: (message) => authEmail.send(message),
              }
            );

            return CloudflareEmailBindingAuthEmailTransportLive.pipe(
              Layer.provide(cloudflareEmailBindingLive)
            );
          }),
          Match.exhaustive
        )
      )
    )
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

const worker = {
  async fetch(
    request: Request,
    env: ApiWorkerEnv,
    context: ExecutionContext
  ): Promise<Response> {
    const { handler } = makeWorkerApiHandler(env, context);

    return await handler(request);
  },

  async queue(batch: MessageBatch<unknown>, env: ApiWorkerEnv): Promise<void> {
    await Effect.runPromise(
      Effect.forEach(batch.messages, handleQueuedAuthEmailMessage, {
        discard: true,
      }).pipe(
        Effect.provide(makeWorkerAuthEmailSenderLive(env)),
        Effect.provide(makeWorkerBaseLive(env))
      )
    );
  },
} satisfies ExportedHandler<ApiWorkerEnv, unknown>;

export default worker;
