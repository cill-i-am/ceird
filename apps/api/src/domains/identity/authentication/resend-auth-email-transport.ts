import { Layer, Effect } from "effect";
import type { CreateEmailOptions, CreateEmailResponse } from "resend";
import { Resend as ResendClient } from "resend";

import { loadAuthEmailConfig } from "./auth-email-config.js";
import { AuthEmailDeliveryError } from "./auth-email-errors.js";
import { AuthEmailTransport } from "./auth-email.js";
import type { TransportMessage } from "./auth-email.js";

interface ResendEmailsClient {
  readonly send: (payload: CreateEmailOptions) => Promise<CreateEmailResponse>;
}

function formatFromAddress(from: string, fromName: string) {
  return `${fromName} <${from}>`;
}

function makeAuthEmailDeliveryError(cause: unknown) {
  if (cause instanceof AuthEmailDeliveryError) {
    return cause;
  }

  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return new AuthEmailDeliveryError({
      message: "Failed to send auth email via Resend",
      cause: cause.message,
    });
  }

  return new AuthEmailDeliveryError({
    message: "Failed to send auth email via Resend",
    cause: String(cause),
  });
}

function buildPayload(
  message: TransportMessage,
  configuredSender: string
): CreateEmailOptions {
  return {
    from: configuredSender,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  };
}

export function makeResendAuthEmailTransport(options?: {
  readonly resend?: {
    readonly emails: ResendEmailsClient;
  };
}) {
  return Effect.gen(function* makeResendAuthEmailTransportEffect() {
    const config = yield* loadAuthEmailConfig;
    const resend = options?.resend ?? new ResendClient(config.resendApiKey);
    const configuredSender = formatFromAddress(config.from, config.fromName);

    return {
      send: (message: TransportMessage) =>
        Effect.tryPromise({
          try: async () => {
            const response = await resend.emails.send(
              buildPayload(message, configuredSender)
            );

            if (response.error) {
              throw new AuthEmailDeliveryError({
                message: "Failed to send auth email via Resend",
                cause: response.error.message,
              });
            }
          },
          catch: makeAuthEmailDeliveryError,
        }),
    };
  });
}

export const ResendAuthEmailTransportLive = Layer.effect(
  AuthEmailTransport,
  makeResendAuthEmailTransport()
);
