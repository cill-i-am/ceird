import CloudflareApi, { APIError } from "cloudflare";
import type {
  EmailSendingSendParams,
  EmailSendingSendResponse,
} from "cloudflare/resources/email-sending/email-sending";
import { Effect, Layer, Schema } from "effect";

import { loadAuthEmailConfig } from "./auth-email-config.js";
import {
  AuthEmailRejectedError,
  AuthEmailRequestError,
} from "./auth-email-errors.js";
import {
  buildRecipientLogContext,
  buildRedactedRecipientDescription,
  makeDeliveryKeyDedupeStore,
} from "./auth-email-transport-helpers.js";
import { AuthEmailTransport } from "./auth-email.js";
import type { TransportMessage } from "./auth-email.js";

interface CloudflareEmailSendingClient {
  readonly send: (
    params: EmailSendingSendParams
  ) => PromiseLike<EmailSendingSendResponse>;
}

const CloudflareSingleRecipientResponseBuckets = Schema.Struct({
  delivered: Schema.Array(Schema.String),
  permanent_bounces: Schema.Array(Schema.String),
  queued: Schema.Array(Schema.String),
});

function buildPayload(
  config: {
    readonly cloudflareAccountId: string;
    readonly from: string;
    readonly fromName: string;
  },
  message: Omit<TransportMessage, "deliveryKey">
): EmailSendingSendParams {
  return {
    account_id: config.cloudflareAccountId,
    from: {
      address: config.from,
      name: config.fromName,
    },
    to: [message.to],
    subject: message.subject,
    text: message.text,
    html: message.html,
  };
}

const decodeSingleRecipientResponseBuckets = Schema.decodeUnknown(
  CloudflareSingleRecipientResponseBuckets
);

function classifySingleRecipientResponse(
  response: EmailSendingSendResponse,
  recipient: string
) {
  return decodeSingleRecipientResponseBuckets(response).pipe(
    Effect.mapError(
      () =>
        new AuthEmailRequestError({
          message: "Auth email request failed",
          cause: "Cloudflare returned a malformed email send response",
        })
    ),
    Effect.flatMap((buckets) => {
      const deliveryOutcomes = [
        ...buckets.delivered.map((address) => ({
          address,
          bucket: "delivered" as const,
        })),
        ...buckets.queued.map((address) => ({
          address,
          bucket: "queued" as const,
        })),
        ...buckets.permanent_bounces.map((address) => ({
          address,
          bucket: "permanent_bounces" as const,
        })),
      ];

      if (
        deliveryOutcomes.length !== 1 ||
        deliveryOutcomes[0]?.address !== recipient
      ) {
        return Effect.fail(
          new AuthEmailRequestError({
            message: "Auth email request failed",
            cause:
              "Cloudflare returned an unexpected single-recipient delivery status",
          })
        );
      }

      return Effect.succeed(deliveryOutcomes[0].bucket);
    })
  );
}

function makeAuthEmailRequestError(cause: unknown) {
  if (
    cause instanceof AuthEmailRequestError ||
    cause instanceof AuthEmailRejectedError
  ) {
    return cause;
  }

  if (cause instanceof APIError) {
    const providerMessage =
      cause.errors.map((error) => error.message).join("; ") || cause.message;

    return new AuthEmailRequestError({
      message: "Auth email request failed",
      cause: providerMessage,
    });
  }

  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return new AuthEmailRequestError({
      message: "Auth email request failed",
      cause: cause.message,
    });
  }

  return new AuthEmailRequestError({
    message: "Auth email request failed",
    cause: String(cause),
  });
}

export function makeCloudflareAuthEmailTransport(options?: {
  readonly cloudflare?: CloudflareEmailSendingClient;
}) {
  return Effect.gen(function* makeCloudflareAuthEmailTransportEffect() {
    const config = yield* loadAuthEmailConfig;
    const cloudflare =
      options?.cloudflare ??
      new CloudflareApi({
        apiToken: config.cloudflareApiToken,
        accountId: config.cloudflareAccountId,
      }).emailSending;
    const deliveryKeyDedupe = makeDeliveryKeyDedupeStore();

    const send = Effect.fn("CloudflareAuthEmailTransport.send")(function* (
      message: TransportMessage
    ) {
      const logContext = {
        ...buildRecipientLogContext(message.to),
        provider: "cloudflare",
        deliveryKey: message.deliveryKey,
      };
      const logOutcome = (
        outcomeBucket:
          | "delivered"
          | "queued"
          | "permanent_bounces"
          | "request_failed"
          | "deduped"
      ) =>
        Effect.log("Auth email transport send outcome", {
          ...logContext,
          outcomeBucket,
        });
      const sendEffect = Effect.log("Auth email transport send attempt", {
        ...logContext,
        outcomeBucket: "attempt",
      }).pipe(
        Effect.zipRight(
          Effect.tryPromise({
            try: async () => {
              const response = await cloudflare.send(
                buildPayload(config, message)
              );

              return response;
            },
            catch: makeAuthEmailRequestError,
          })
        ),
        Effect.flatMap((response) =>
          classifySingleRecipientResponse(response, message.to)
        ),
        Effect.flatMap((outcomeBucket) =>
          outcomeBucket === "permanent_bounces"
            ? Effect.fail(
                new AuthEmailRejectedError({
                  message: "Auth email was rejected",
                  cause: `Cloudflare permanently bounced ${buildRedactedRecipientDescription(message.to)}`,
                })
              )
            : logOutcome(outcomeBucket)
        ),
        Effect.catchTags({
          AuthEmailRejectedError: (error) =>
            logOutcome("permanent_bounces").pipe(
              Effect.zipRight(Effect.fail(error))
            ),
          AuthEmailRequestError: (error) =>
            logOutcome("request_failed").pipe(
              Effect.zipRight(Effect.fail(error))
            ),
        }),
        Effect.asVoid
      );

      const { deliveryKey } = message;

      if (!deliveryKey) {
        return yield* sendEffect;
      }

      // This is best-effort, process-local dedupe for the in-process background
      // task model; retryable failures are released so queue retries can attempt
      // delivery again.
      return yield* Effect.sync(() =>
        deliveryKeyDedupe.reserve(deliveryKey)
      ).pipe(
        Effect.flatMap((shouldSend) =>
          shouldSend
            ? sendEffect.pipe(
                Effect.tap(() =>
                  Effect.sync(() => deliveryKeyDedupe.retain(deliveryKey))
                ),
                Effect.catchTags({
                  AuthEmailRejectedError: (error) =>
                    Effect.sync(() =>
                      deliveryKeyDedupe.release(deliveryKey)
                    ).pipe(Effect.zipRight(Effect.fail(error))),
                  AuthEmailRequestError: (error) =>
                    Effect.sync(() =>
                      deliveryKeyDedupe.release(deliveryKey)
                    ).pipe(Effect.zipRight(Effect.fail(error))),
                })
              )
            : logOutcome("deduped").pipe(Effect.asVoid)
        )
      );
    });

    return { send };
  });
}

export const CloudflareAuthEmailTransportLive = Layer.effect(
  AuthEmailTransport,
  makeCloudflareAuthEmailTransport()
);
