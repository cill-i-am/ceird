import { createHash } from "node:crypto";

import CloudflareApi, { APIError } from "cloudflare";
import type {
  EmailSendingSendParams,
  EmailSendingSendResponse,
} from "cloudflare/resources/email-sending/email-sending";
import { Effect, Layer } from "effect";

import { loadAuthEmailConfig } from "./auth-email-config.js";
import {
  AuthEmailRejectedError,
  AuthEmailRequestError,
} from "./auth-email-errors.js";
import { AuthEmailTransport } from "./auth-email.js";
import type { TransportMessage } from "./auth-email.js";

interface SingleRecipientResponseBuckets {
  readonly delivered: readonly string[];
  readonly permanentBounces: readonly string[];
  readonly queued: readonly string[];
}

interface CloudflareEmailSendingClient {
  readonly send: (
    params: EmailSendingSendParams
  ) => PromiseLike<EmailSendingSendResponse>;
}

const DELIVERY_KEY_DEDUPE_TTL_MS = 10 * 60 * 1000;

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

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function decodeSingleRecipientResponseBuckets(
  response: EmailSendingSendResponse
): SingleRecipientResponseBuckets {
  if (
    !isStringArray(response.delivered) ||
    !isStringArray(response.permanent_bounces) ||
    !isStringArray(response.queued)
  ) {
    throw new AuthEmailRequestError({
      message: "Auth email request failed",
      cause: "Cloudflare returned a malformed email send response",
    });
  }

  return {
    delivered: response.delivered,
    permanentBounces: response.permanent_bounces,
    queued: response.queued,
  };
}

function classifySingleRecipientResponse(
  response: EmailSendingSendResponse,
  recipient: string
) {
  const buckets = decodeSingleRecipientResponseBuckets(response);
  const deliveryOutcomes = [
    ...buckets.delivered.map((address) => ({
      address,
      bucket: "delivered" as const,
    })),
    ...buckets.queued.map((address) => ({
      address,
      bucket: "queued" as const,
    })),
    ...buckets.permanentBounces.map((address) => ({
      address,
      bucket: "permanent_bounces" as const,
    })),
  ];

  if (
    deliveryOutcomes.length !== 1 ||
    deliveryOutcomes[0]?.address !== recipient
  ) {
    throw new AuthEmailRequestError({
      message: "Auth email request failed",
      cause:
        "Cloudflare returned an unexpected single-recipient delivery status",
    });
  }

  return deliveryOutcomes[0].bucket;
}

function buildRecipientLogContext(recipient: string) {
  const [_, domain = ""] = recipient.split("@");

  return {
    recipientDomain: domain,
    recipientHash: createHash("sha256")
      .update(recipient)
      .digest("hex")
      .slice(0, 16),
  };
}

function buildRedactedRecipientDescription(recipient: string) {
  const [_, domain = ""] = recipient.split("@");

  return domain.length > 0 ? `recipient at ${domain}` : "recipient";
}

function pruneExpiredDeliveryKeys(
  dedupeEntries: Map<string, number>,
  now: number
) {
  for (const [deliveryKey, expiresAt] of dedupeEntries.entries()) {
    if (expiresAt <= now) {
      dedupeEntries.delete(deliveryKey);
    }
  }
}

function reserveDeliveryKey(
  dedupeEntries: Map<string, number>,
  deliveryKey: string
) {
  const now = Date.now();
  pruneExpiredDeliveryKeys(dedupeEntries, now);

  if (dedupeEntries.has(deliveryKey)) {
    return false;
  }

  dedupeEntries.set(deliveryKey, now + DELIVERY_KEY_DEDUPE_TTL_MS);
  return true;
}

function retainDeliveryKey(
  dedupeEntries: Map<string, number>,
  deliveryKey: string
) {
  dedupeEntries.set(deliveryKey, Date.now() + DELIVERY_KEY_DEDUPE_TTL_MS);
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
    const deliveryKeyDedupeEntries = new Map<string, number>();

    return {
      send: (message: TransportMessage) => {
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

                return classifySingleRecipientResponse(response, message.to);
              },
              catch: makeAuthEmailRequestError,
            })
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
          return sendEffect;
        }

        // This is best-effort, process-local dedupe for the in-process background
        // task model; it favors avoiding duplicate delivery over retrying after
        // ambiguous failures.
        return Effect.sync(() =>
          reserveDeliveryKey(deliveryKeyDedupeEntries, deliveryKey)
        ).pipe(
          Effect.flatMap((shouldSend) =>
            shouldSend
              ? sendEffect.pipe(
                  Effect.tap(() =>
                    Effect.sync(() =>
                      retainDeliveryKey(deliveryKeyDedupeEntries, deliveryKey)
                    )
                  ),
                  Effect.catchTags({
                    AuthEmailRejectedError: (error) =>
                      Effect.sync(() =>
                        retainDeliveryKey(deliveryKeyDedupeEntries, deliveryKey)
                      ).pipe(Effect.zipRight(Effect.fail(error))),
                    AuthEmailRequestError: (error) =>
                      Effect.sync(() =>
                        retainDeliveryKey(deliveryKeyDedupeEntries, deliveryKey)
                      ).pipe(Effect.zipRight(Effect.fail(error))),
                  })
                )
              : logOutcome("deduped").pipe(Effect.asVoid)
          )
        );
      },
    };
  });
}

export const CloudflareAuthEmailTransportLive = Layer.effect(
  AuthEmailTransport,
  makeCloudflareAuthEmailTransport()
);
