import { Context, Effect, Layer } from "effect";

import { AuthEmailConfigService } from "./auth-email-config.js";
import { AuthEmailRequestError } from "./auth-email-errors.js";
import {
  buildRecipientLogContext,
  makeDeliveryKeyDedupeStore,
  serializeUnknownError,
} from "./auth-email-transport-helpers.js";
import { AuthEmailTransport } from "./auth-email.js";
import type { TransportMessage } from "./auth-email.js";

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
  "@task-tracker/platform/cloudflare/CloudflareEmailBinding"
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

export const CloudflareEmailBindingAuthEmailTransportLive = Layer.effect(
  AuthEmailTransport,
  Effect.gen(function* CloudflareEmailBindingAuthEmailTransportLiveEffect() {
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
              Effect.zipRight(Effect.fail(error))
            )
          )
        );

        const { deliveryKey } = message;

        if (!deliveryKey) {
          return yield* sendEffect;
        }

        return yield* Effect.sync(() =>
          deliveryKeyDedupe.reserve(deliveryKey)
        ).pipe(
          Effect.flatMap((shouldSend) =>
            shouldSend
              ? sendEffect.pipe(
                  Effect.tap(() =>
                    Effect.sync(() => deliveryKeyDedupe.retain(deliveryKey))
                  ),
                  Effect.catchTag("AuthEmailRequestError", (error) =>
                    Effect.sync(() =>
                      deliveryKeyDedupe.release(deliveryKey)
                    ).pipe(Effect.zipRight(Effect.fail(error)))
                  )
                )
              : logOutcome("deduped")
          )
        );
      }
    );

    return { send };
  })
).pipe(Layer.provide(AuthEmailConfigService.Default));
