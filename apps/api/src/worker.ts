import { Cause, ConfigProvider, Effect, Exit, Layer, Option } from "effect";

import { AuthEmailPromiseBridge } from "./domains/identity/authentication/auth-email-promise-bridge.js";
import {
  AuthEmailQueueDeliveryError,
  InvalidAuthEmailQueueMessageError,
  decodeAuthEmailQueueMessageEffect,
  makeCloudflareAuthenticationEmailSchedulerLive,
  sendAuthEmailQueueMessage,
} from "./domains/identity/authentication/auth-email-queue.js";
import {
  AuthenticationBackgroundTaskHandler,
  makeAuthenticationHttpLive,
} from "./domains/identity/authentication/auth.js";
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

function makeWorkerApiHandler(env: ApiWorkerEnv, context: ExecutionContext) {
  const baseLive = makeWorkerBaseLive(env);
  const databaseRuntimeLive = makeAppDatabaseRuntimeLive(
    makeAppDatabaseLive(env.DATABASE.connectionString)
  );
  const authenticationHttpLive = makeAuthenticationHttpLive(
    makeCloudflareAuthenticationEmailSchedulerLive(env.AUTH_EMAIL_QUEUE),
    Layer.succeed(AuthenticationBackgroundTaskHandler, (task) => {
      context.waitUntil(task);
    })
  );

  return makeApiWebHandler(
    databaseRuntimeLive,
    authenticationHttpLive,
    baseLive
  );
}

function sendQueuedAuthEmail(body: unknown, env: ApiWorkerEnv) {
  return decodeAuthEmailQueueMessageEffect(body).pipe(
    Effect.flatMap(sendAuthEmailQueueMessage),
    Effect.provide(AuthEmailPromiseBridge.Default),
    Effect.provide(makeWorkerBaseLive(env))
  );
}

export default {
  async fetch(
    request: Request,
    env: ApiWorkerEnv,
    context: ExecutionContext
  ): Promise<Response> {
    const { handler } = makeWorkerApiHandler(env, context);

    return await handler(request);
  },

  async queue(batch: MessageBatch<unknown>, env: ApiWorkerEnv): Promise<void> {
    for (const message of batch.messages) {
      const exit = await Effect.runPromiseExit(
        sendQueuedAuthEmail(message.body, env)
      );

      if (Exit.isSuccess(exit)) {
        message.ack();
        continue;
      }

      const failure = Cause.failureOption(exit.cause);

      if (
        Option.isSome(failure) &&
        failure.value instanceof InvalidAuthEmailQueueMessageError
      ) {
        await Effect.runPromise(
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
        await Effect.runPromise(
          Effect.logWarning("Auth email queue delivery failed; retrying").pipe(
            Effect.annotateLogs({
              ...(failure.value.cause
                ? { authEmailQueueFailureCause: failure.value.cause }
                : {}),
              authEmailQueueFailureMessage: failure.value.message,
              authEmailQueueFailureTag: failure.value._tag,
            })
          )
        );
        message.retry({ delaySeconds: 30 });
        continue;
      }

      await Effect.runPromise(
        Effect.logError("Auth email queue handler failed with a defect").pipe(
          Effect.annotateLogs({
            authEmailQueueFailureMessage: String(Cause.squash(exit.cause)),
          })
        )
      );
      message.retry({ delaySeconds: 30 });
    }
  },
};
