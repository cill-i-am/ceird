import { Context, Effect } from "effect";

import { AuthEmailConfigService } from "./auth-email-config.js";
import { AuthEmailRequestError } from "./auth-email-errors.js";
import {
  buildRecipientLogContext,
  makeDeliveryKeyDedupeStore,
  sendWithDeliveryKeyDedupe,
  serializeUnknownError,
} from "./auth-email-transport-helpers.js";
import type { TransportMessage } from "./auth-email-transport.js";

export interface CloudflareEmailBindingMessage {
  readonly from: string | { readonly email: string; readonly name: string };
  readonly html?: string;
  readonly subject: string;
  readonly text?: string;
  readonly to: string | string[];
}

export interface CloudflareEmailBindingSendResult {
  readonly messageId: string;
}

export class CloudflareEmailBinding extends Context.Tag(
  "@ceird/platform/cloudflare/CloudflareEmailBinding"
)<
  CloudflareEmailBinding,
  {
    readonly send: (
      message: CloudflareEmailBindingMessage
    ) => PromiseLike<CloudflareEmailBindingSendResult>;
  }
>() {}

function buildBindingMessage(
  config: {
    readonly from: string;
    readonly fromName: string;
  },
  message: Omit<TransportMessage, "deliveryKey">
): CloudflareEmailBindingMessage {
  return {
    from: {
      email: config.from,
      name: config.fromName,
    },
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  };
}

export function makeCloudflareEmailBindingAuthEmailTransport() {
  return Effect.gen(function* CloudflareEmailBindingAuthEmailTransportEffect() {
    const binding = yield* CloudflareEmailBinding;
    const config = yield* AuthEmailConfigService;
    const deliveryKeyDedupe = makeDeliveryKeyDedupeStore();

    const send = Effect.fn("CloudflareEmailBindingAuthEmailTransport.send")(
      function* (message: TransportMessage) {
        const logContext = {
          ...buildRecipientLogContext(message.to),
          provider: "cloudflare-email-binding",
          deliveryKey: message.deliveryKey,
        };

        const logOutcome = (
          outcomeBucket: "sent" | "request_failed" | "deduped"
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
              try: () => binding.send(buildBindingMessage(config, message)),
              catch: (cause) =>
                new AuthEmailRequestError({
                  message: "Auth email request failed",
                  cause: serializeUnknownError(cause),
                }),
            })
          ),
          Effect.zipRight(logOutcome("sent")),
          Effect.catchTag("AuthEmailRequestError", (error) =>
            logOutcome("request_failed").pipe(
              Effect.annotateLogs({
                authEmailFailureCause: error.cause ?? error.message,
                authEmailFailureTag: error._tag,
              }),
              Effect.zipRight(Effect.fail(error))
            )
          )
        );

        return yield* sendWithDeliveryKeyDedupe({
          deliveryKey: message.deliveryKey,
          dedupeStore: deliveryKeyDedupe,
          sendEffect,
          logDeduped: logOutcome("deduped"),
        });
      }
    );

    return { send };
  });
}
