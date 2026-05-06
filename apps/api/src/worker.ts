import * as Sentry from "@sentry/cloudflare";
import {
  Cause,
  ConfigProvider,
  Effect,
  Exit,
  Layer,
  Option,
  Runtime,
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
import type { ApiWorkerEnv } from "./platform/cloudflare/env.js";
import { apiWorkerEnvConfigMap } from "./platform/cloudflare/env.js";
import {
  makeAppDatabaseLive,
  makeAppDatabaseRuntimeLive,
} from "./platform/database/database.js";
import {
  apiSentryConfigFromWorkerEnv,
  makeApiSentryWorkerInstrumentationLayer,
  makeSentryOptions,
} from "./platform/sentry/sentry-worker.js";
import { makeApiWebHandler } from "./server.js";

function makeWorkerBaseLive(env: ApiWorkerEnv) {
  return Layer.mergeAll(
    Layer.setConfigProvider(ConfigProvider.fromMap(apiWorkerEnvConfigMap(env))),
    makeApiSentryWorkerInstrumentationLayer(apiSentryConfigFromWorkerEnv(env)),
    makeWorkerCloudflareEmailBindingLive(env)
  );
}

function makeWorkerCloudflareEmailBindingLive(env: ApiWorkerEnv) {
  const authEmail = env.AUTH_EMAIL;

  if (!authEmail) {
    return Layer.empty;
  }

  return Layer.succeed(CloudflareEmailBinding, {
    send: (message) => authEmail.send(message),
  });
}

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

  return makeApiWebHandler(databaseRuntimeLive, authenticationLive, baseLive);
}

function makeWorkerAuthEmailTransportLive(env: ApiWorkerEnv) {
  return Layer.unwrapEffect(
    loadAuthEmailConfig.pipe(
      Effect.map(({ transportMode }) => {
        switch (transportMode) {
          case "noop": {
            return NoopAuthEmailTransportLive;
          }
          case "cloudflare-api": {
            return CloudflareAuthEmailTransportLive;
          }
          case "cloudflare-binding": {
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
          }
          default: {
            const exhaustive: never = transportMode;
            return exhaustive;
          }
        }
      })
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
    const runtime = await Effect.runPromise(
      Effect.runtime<AuthEmailSender>().pipe(
        Effect.provide(makeWorkerAuthEmailSenderLive(env)),
        Effect.provide(makeWorkerBaseLive(env))
      )
    );
    const runQueuedAuthEmail = Runtime.runPromiseExit(runtime);
    const runWorkerEffect = Runtime.runPromise(runtime);

    for (const message of batch.messages) {
      const exit = await runQueuedAuthEmail(sendQueuedAuthEmail(message.body));

      if (Exit.isSuccess(exit)) {
        message.ack();
        continue;
      }

      const failure = Cause.failureOption(exit.cause);

      if (
        Option.isSome(failure) &&
        failure.value instanceof InvalidAuthEmailQueueMessageError
      ) {
        await runWorkerEffect(
          Effect.logWarning("Invalid auth email queue message discarded").pipe(
            Effect.annotateLogs({
              authEmailQueueFailureCause: failure.value.cause,
              authEmailQueueFailureMessage: failure.value.message,
              authEmailQueueFailureTag: failure.value._tag,
            })
          )
        );
        message.ack();
        continue;
      }

      if (
        Option.isSome(failure) &&
        failure.value instanceof AuthEmailQueueDeliveryError
      ) {
        await runWorkerEffect(
          Effect.logWarning("Auth email queue delivery failed; retrying").pipe(
            Effect.annotateLogs({
              ...(failure.value.cause
                ? { authEmailQueueFailureCause: failure.value.cause }
                : {}),
              ...(failure.value.deliveryKey
                ? { authEmailQueueDeliveryKey: failure.value.deliveryKey }
                : {}),
              ...(failure.value.emailKind
                ? { authEmailQueueEmailKind: failure.value.emailKind }
                : {}),
              authEmailQueueFailureMessage: failure.value.message,
              ...(failure.value.sourceCause
                ? {
                    authEmailQueueFailureSourceCause: failure.value.sourceCause,
                  }
                : {}),
              ...(failure.value.sourceTag
                ? { authEmailQueueFailureSourceTag: failure.value.sourceTag }
                : {}),
              authEmailQueueFailureTag: failure.value._tag,
            })
          )
        );
        message.retry({ delaySeconds: 30 });
        continue;
      }

      await runWorkerEffect(
        Effect.logError("Auth email queue handler failed with a defect").pipe(
          Effect.annotateLogs({
            authEmailQueueFailureMessage: String(Cause.squash(exit.cause)),
          })
        )
      );
      message.retry({ delaySeconds: 30 });
    }
  },
} satisfies ExportedHandler<ApiWorkerEnv, unknown>;

export default Sentry.withSentry(
  (env: ApiWorkerEnv) => makeSentryOptions(apiSentryConfigFromWorkerEnv(env)),
  worker
);
