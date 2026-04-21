/* oxlint-disable eslint/max-classes-per-file, unicorn/no-array-method-this-argument */

import { Context, Effect, ParseResult, Schema } from "effect";

import type {
  AuthEmailRejectedError,
  AuthEmailRequestError,
} from "./auth-email-errors.js";
import {
  InvalidPasswordResetEmailInputError,
  PasswordResetEmailRejectedError,
  PasswordResetEmailRequestError,
} from "./auth-email-errors.js";

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RESET_DELIVERY_KEY_PATTERN = /^password-reset\/[0-9a-f]{64}$/;

function isValidEmailAddress(value: string) {
  return EMAIL_ADDRESS_PATTERN.test(value);
}

function isValidResetUrl(value: string) {
  try {
    const url = new URL(value);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const EmailAddress = Schema.String.pipe(
  Schema.filter((value) => isValidEmailAddress(value), {
    message: () => "Expected a valid email address",
  })
);

const DeliveryKey = Schema.String.pipe(
  Schema.filter((value) => PASSWORD_RESET_DELIVERY_KEY_PATTERN.test(value), {
    message: () =>
      "Expected a password reset delivery key in the format password-reset/<sha256>",
  })
);

const ResetUrl = Schema.String.pipe(
  Schema.filter((value) => isValidResetUrl(value), {
    message: () => "Expected a valid http or https URL without credentials",
  })
);

export const PasswordResetEmailInput = Schema.Struct({
  deliveryKey: DeliveryKey,
  recipientEmail: EmailAddress,
  recipientName: Schema.String,
  resetUrl: ResetUrl,
});

export type PasswordResetEmailInput = Schema.Schema.Type<
  typeof PasswordResetEmailInput
>;

const decodePasswordResetEmailInput = Schema.decodeUnknown(
  PasswordResetEmailInput
);

export interface TransportMessage {
  readonly deliveryKey?: string;
  readonly html: string;
  readonly subject: string;
  readonly text: string;
  readonly to: string;
}

export type AuthEmailTransportError =
  | AuthEmailRejectedError
  | AuthEmailRequestError;
export type PasswordResetEmailError =
  | InvalidPasswordResetEmailInputError
  | PasswordResetEmailRejectedError
  | PasswordResetEmailRequestError;

export class AuthEmailTransport extends Context.Tag(
  "@task-tracker/domains/identity/authentication/AuthEmailTransport"
)<
  AuthEmailTransport,
  {
    readonly send: (
      message: TransportMessage
    ) => Effect.Effect<void, AuthEmailTransportError>;
  }
>() {}

export class AuthEmailSender extends Effect.Service<AuthEmailSender>()(
  "@task-tracker/domains/identity/authentication/AuthEmailSender",
  {
    accessors: true,
    effect: Effect.gen(function* effect() {
      const transport = yield* AuthEmailTransport;

      const sendPasswordResetEmail = Effect.fn(
        "AuthEmailSender.sendPasswordResetEmail"
      )(function* sendPasswordResetEmail(rawInput: unknown) {
        const input = yield* decodePasswordResetEmailInput(rawInput).pipe(
          Effect.mapError(
            (parseError) =>
              new InvalidPasswordResetEmailInputError({
                message: "Invalid password reset email input",
                cause: ParseResult.TreeFormatter.formatErrorSync(parseError),
              })
          )
        );

        const subject = "Reset your password";
        const text = [
          `Hello ${input.recipientName},`,
          "",
          "Use this link to reset your password:",
          input.resetUrl,
        ].join("\n");
        const html = [
          `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
          `<p><a href="${escapeHtml(input.resetUrl)}">Reset your password</a></p>`,
        ].join("");

        yield* transport
          .send({
            deliveryKey: input.deliveryKey,
            to: input.recipientEmail,
            subject,
            text,
            html,
          })
          .pipe(
            Effect.catchTags({
              AuthEmailRejectedError: (error) =>
                Effect.fail(
                  new PasswordResetEmailRejectedError({
                    message: "Password reset email was rejected for delivery",
                    cause: error.cause ?? error.message,
                  })
                ),
              AuthEmailRequestError: (error) =>
                Effect.fail(
                  new PasswordResetEmailRequestError({
                    message: "Failed to deliver password reset email",
                    cause: error.cause ?? error.message,
                  })
                ),
            })
          );
      });

      return { sendPasswordResetEmail };
    }),
  }
) {}
