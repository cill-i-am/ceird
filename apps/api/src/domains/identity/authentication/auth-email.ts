/* oxlint-disable eslint/max-classes-per-file, unicorn/no-array-method-this-argument */

import { OrganizationRole } from "@task-tracker/identity-core";
import { Context, Effect, ParseResult, Schema } from "effect";

import type {
  AuthEmailRejectedError,
  AuthEmailRequestError,
} from "./auth-email-errors.js";
import {
  EmailVerificationEmailRejectedError,
  EmailVerificationEmailRequestError,
  InvalidPasswordResetEmailInputError,
  InvalidEmailVerificationEmailInputError,
  InvalidOrganizationInvitationEmailInputError,
  OrganizationInvitationEmailRejectedError,
  OrganizationInvitationEmailRequestError,
  PasswordResetEmailRejectedError,
  PasswordResetEmailRequestError,
} from "./auth-email-errors.js";

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RESET_DELIVERY_KEY_PATTERN = /^password-reset\/[0-9a-f]{64}$/;
const DELIVERY_KEY_MAX_LENGTH = 256;

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

const PasswordResetDeliveryKey = Schema.String.pipe(
  Schema.filter((value) => PASSWORD_RESET_DELIVERY_KEY_PATTERN.test(value), {
    message: () =>
      "Expected a password reset delivery key in the format password-reset/<sha256>",
  })
);

const DeliveryKey = Schema.String.pipe(
  Schema.filter(
    (value) =>
      value.trim().length > 0 && value.length <= DELIVERY_KEY_MAX_LENGTH,
    {
      message: () =>
        `Expected a non-empty delivery key up to ${DELIVERY_KEY_MAX_LENGTH} characters`,
    }
  )
);

const ResetUrl = Schema.String.pipe(
  Schema.filter((value) => isValidResetUrl(value), {
    message: () => "Expected a valid http or https URL without credentials",
  })
);
const InvitationUrl = ResetUrl;
export const VerificationUrl = ResetUrl;

export const PasswordResetEmailInput = Schema.Struct({
  deliveryKey: PasswordResetDeliveryKey,
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

export const OrganizationInvitationEmailInput = Schema.Struct({
  deliveryKey: DeliveryKey,
  recipientEmail: EmailAddress,
  recipientName: Schema.String,
  organizationName: Schema.String,
  inviterEmail: EmailAddress,
  invitationUrl: InvitationUrl,
  role: OrganizationRole,
});

export type OrganizationInvitationEmailInput = Schema.Schema.Type<
  typeof OrganizationInvitationEmailInput
>;

const decodeOrganizationInvitationEmailInput = Schema.decodeUnknown(
  OrganizationInvitationEmailInput
);

export const EmailVerificationEmailInput = Schema.Struct({
  deliveryKey: DeliveryKey,
  recipientEmail: EmailAddress,
  recipientName: Schema.String,
  verificationUrl: VerificationUrl,
});

export type EmailVerificationEmailInput = Schema.Schema.Type<
  typeof EmailVerificationEmailInput
>;

const decodeEmailVerificationEmailInput = Schema.decodeUnknown(
  EmailVerificationEmailInput
);

function formatParseError(parseError: ParseResult.ParseError) {
  return ParseResult.TreeFormatter.formatErrorSync(parseError);
}

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
export type OrganizationInvitationEmailError =
  | InvalidOrganizationInvitationEmailInputError
  | OrganizationInvitationEmailRejectedError
  | OrganizationInvitationEmailRequestError;
export type PasswordResetEmailError =
  | InvalidPasswordResetEmailInputError
  | PasswordResetEmailRejectedError
  | PasswordResetEmailRequestError;
export type EmailVerificationEmailError =
  | InvalidEmailVerificationEmailInputError
  | EmailVerificationEmailRejectedError
  | EmailVerificationEmailRequestError;

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

function decodeAuthEmailInput<Input, ErrorType>(options: {
  readonly rawInput: unknown;
  readonly decode: (
    input: unknown
  ) => Effect.Effect<Input, ParseResult.ParseError>;
  readonly onInvalidInput: (cause: string) => ErrorType;
}) {
  return options
    .decode(options.rawInput)
    .pipe(
      Effect.mapError((parseError) =>
        options.onInvalidInput(formatParseError(parseError))
      )
    );
}

export class AuthEmailSender extends Effect.Service<AuthEmailSender>()(
  "@task-tracker/domains/identity/authentication/AuthEmailSender",
  {
    accessors: true,
    effect: Effect.gen(function* effect() {
      const transport = yield* AuthEmailTransport;

      const sendPasswordResetEmail = Effect.fn(
        "AuthEmailSender.sendPasswordResetEmail"
      )(function* sendPasswordResetEmail(rawInput: unknown) {
        const input = yield* decodeAuthEmailInput({
          rawInput,
          decode: decodePasswordResetEmailInput,
          onInvalidInput: (cause) =>
            new InvalidPasswordResetEmailInputError({
              message: "Invalid password reset email input",
              cause,
            }),
        });

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

      const sendOrganizationInvitationEmail = Effect.fn(
        "AuthEmailSender.sendOrganizationInvitationEmail"
      )(function* sendOrganizationInvitationEmail(rawInput: unknown) {
        const input = yield* decodeAuthEmailInput({
          rawInput,
          decode: decodeOrganizationInvitationEmailInput,
          onInvalidInput: (cause) =>
            new InvalidOrganizationInvitationEmailInputError({
              message: "Invalid organization invitation email input",
              cause,
            }),
        });

        const subject = `Join ${input.organizationName} on Task Tracker`;
        const text = [
          `Hello ${input.recipientName},`,
          "",
          `${input.inviterEmail} invited you to join ${input.organizationName} as a ${input.role}.`,
          "",
          input.invitationUrl,
        ].join("\n");
        const html = [
          `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
          `<p>${escapeHtml(input.inviterEmail)} invited you to join ${escapeHtml(input.organizationName)} as a ${escapeHtml(input.role)}.</p>`,
          `<p><a href="${escapeHtml(input.invitationUrl)}">Accept invitation</a></p>`,
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
                  new OrganizationInvitationEmailRejectedError({
                    message:
                      "Organization invitation email was rejected for delivery",
                    cause: error.cause ?? error.message,
                  })
                ),
              AuthEmailRequestError: (error) =>
                Effect.fail(
                  new OrganizationInvitationEmailRequestError({
                    message: "Failed to deliver organization invitation email",
                    cause: error.cause ?? error.message,
                  })
                ),
            })
          );
      });

      const sendEmailVerificationEmail = Effect.fn(
        "AuthEmailSender.sendEmailVerificationEmail"
      )(function* sendEmailVerificationEmail(rawInput: unknown) {
        const input = yield* decodeAuthEmailInput({
          rawInput,
          decode: decodeEmailVerificationEmailInput,
          onInvalidInput: (cause) =>
            new InvalidEmailVerificationEmailInputError({
              message: "Invalid verification email input",
              cause,
            }),
        });

        const subject = "Verify your email";
        const text = [
          `Hello ${input.recipientName},`,
          "",
          "Use this link to verify your email:",
          input.verificationUrl,
        ].join("\n");
        const html = [
          `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
          `<p><a href="${escapeHtml(input.verificationUrl)}">Verify your email</a></p>`,
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
                  new EmailVerificationEmailRejectedError({
                    message: "Verification email was rejected for delivery",
                    cause: error.cause ?? error.message,
                  })
                ),
              AuthEmailRequestError: (error) =>
                Effect.fail(
                  new EmailVerificationEmailRequestError({
                    message: "Failed to deliver verification email",
                    cause: error.cause ?? error.message,
                  })
                ),
            })
          );
      });

      return {
        sendOrganizationInvitationEmail,
        sendPasswordResetEmail,
        sendEmailVerificationEmail,
      };
    }),
  }
) {}
