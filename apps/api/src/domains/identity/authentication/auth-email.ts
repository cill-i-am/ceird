/* oxlint-disable eslint/max-classes-per-file, unicorn/no-array-method-this-argument */

import { Context, Effect, ParseResult, Schema } from "effect";

import type { AuthEmailDeliveryError } from "./auth-email-errors.js";
import { PasswordResetDeliveryError } from "./auth-email-errors.js";

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function extractRecipientEmail(input: unknown) {
  if (
    typeof input === "object" &&
    input !== null &&
    "recipientEmail" in input &&
    typeof input.recipientEmail === "string"
  ) {
    return input.recipientEmail;
  }

  return "unknown";
}

const EmailAddress = Schema.String.pipe(
  Schema.filter((value) => isValidEmailAddress(value), {
    message: () => "Expected a valid email address",
  })
);

const ResetUrl = Schema.String.pipe(
  Schema.filter((value) => isValidResetUrl(value), {
    message: () => "Expected a valid http or https URL without credentials",
  })
);

export const PasswordResetEmailInput = Schema.Struct({
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
  readonly html: string;
  readonly subject: string;
  readonly text: string;
  readonly to: string;
}

export class AuthEmailTransport extends Context.Tag(
  "@task-tracker/domains/identity/authentication/AuthEmailTransport"
)<
  AuthEmailTransport,
  {
    readonly send: (
      message: TransportMessage
    ) => Effect.Effect<void, AuthEmailDeliveryError>;
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
              new PasswordResetDeliveryError({
                message: "Invalid password reset email input",
                recipientEmail: extractRecipientEmail(rawInput),
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
            to: input.recipientEmail,
            subject,
            text,
            html,
          })
          .pipe(
            Effect.mapError(
              (error) =>
                new PasswordResetDeliveryError({
                  message: "Failed to deliver password reset email",
                  recipientEmail: input.recipientEmail,
                  cause: error.message,
                })
            )
          );
      });

      return { sendPasswordResetEmail };
    }),
  }
) {}
