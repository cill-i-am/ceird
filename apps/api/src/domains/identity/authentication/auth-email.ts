/* oxlint-disable eslint/max-classes-per-file, unicorn/no-array-method-this-argument */

import { Context, Effect, ParseResult, Schema } from "effect";

import type { AuthEmailDeliveryError } from "./auth-email-errors.js";
import {
  OrganizationInvitationDeliveryError,
  PasswordResetDeliveryError,
} from "./auth-email-errors.js";

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_IDEMPOTENCY_KEY_MAX_LENGTH = 256;

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

const EmailIdempotencyKey = Schema.String.pipe(
  Schema.filter(
    (value) =>
      value.length > 0 && value.length <= RESEND_IDEMPOTENCY_KEY_MAX_LENGTH,
    {
      message: () =>
        `Expected a non-empty idempotency key up to ${RESEND_IDEMPOTENCY_KEY_MAX_LENGTH} characters`,
    }
  )
);

const ResetUrl = Schema.String.pipe(
  Schema.filter((value) => isValidResetUrl(value), {
    message: () => "Expected a valid http or https URL without credentials",
  })
);
const InvitationUrl = ResetUrl;
const InvitationRole = Schema.Literal("admin", "member");

export const PasswordResetEmailInput = Schema.Struct({
  idempotencyKey: EmailIdempotencyKey,
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
  idempotencyKey: EmailIdempotencyKey,
  recipientEmail: EmailAddress,
  recipientName: Schema.String,
  organizationName: Schema.String,
  inviterEmail: EmailAddress,
  invitationUrl: InvitationUrl,
  role: InvitationRole,
});

export type OrganizationInvitationEmailInput = Schema.Schema.Type<
  typeof OrganizationInvitationEmailInput
>;

const decodeOrganizationInvitationEmailInput = Schema.decodeUnknown(
  OrganizationInvitationEmailInput
);

export interface TransportMessage {
  readonly html: string;
  readonly idempotencyKey?: string;
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
            idempotencyKey: input.idempotencyKey,
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
                  cause: error.message,
                })
            )
          );
      });

      const sendOrganizationInvitationEmail = Effect.fn(
        "AuthEmailSender.sendOrganizationInvitationEmail"
      )(function* sendOrganizationInvitationEmail(rawInput: unknown) {
        const input = yield* decodeOrganizationInvitationEmailInput(
          rawInput
        ).pipe(
          Effect.mapError(
            (parseError) =>
              new OrganizationInvitationDeliveryError({
                message: "Invalid organization invitation email input",
                cause: ParseResult.TreeFormatter.formatErrorSync(parseError),
              })
          )
        );

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
            idempotencyKey: input.idempotencyKey,
            to: input.recipientEmail,
            subject,
            text,
            html,
          })
          .pipe(
            Effect.mapError(
              (error) =>
                new OrganizationInvitationDeliveryError({
                  message: "Failed to deliver organization invitation email",
                  cause: error.message,
                })
            )
          );
      });

      return { sendOrganizationInvitationEmail, sendPasswordResetEmail };
    }),
  }
) {}
