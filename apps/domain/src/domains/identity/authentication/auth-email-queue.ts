/* eslint-disable max-classes-per-file */
import { Effect, Layer, Match, ParseResult, Schema } from "effect";

import {
  AuthenticationEmailScheduler,
  AuthenticationEmailSchedulingError,
} from "./auth-email-scheduler.js";
import { serializeUnknownError } from "./auth-email-transport-helpers.js";
import {
  AuthEmailSender,
  EmailVerificationEmailInput,
  OrganizationInvitationEmailInput,
  PasswordResetEmailInput,
} from "./auth-email.js";
import type {
  EmailVerificationEmailError,
  OrganizationInvitationEmailError,
  PasswordResetEmailError,
} from "./auth-email.js";

export class InvalidAuthEmailQueueMessageError extends Schema.TaggedError<InvalidAuthEmailQueueMessageError>()(
  "InvalidAuthEmailQueueMessageError",
  {
    cause: Schema.String,
    message: Schema.String,
  }
) {}

export class AuthEmailQueueDeliveryError extends Schema.TaggedError<AuthEmailQueueDeliveryError>()(
  "AuthEmailQueueDeliveryError",
  {
    cause: Schema.optional(Schema.String),
    deliveryKey: Schema.optional(Schema.String),
    emailKind: Schema.optional(Schema.String),
    message: Schema.String,
    sourceCause: Schema.optional(Schema.String),
    sourceTag: Schema.optional(Schema.String),
  }
) {}

export const AuthEmailQueueMessage = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("password-reset"),
    payload: PasswordResetEmailInput,
  }),
  Schema.Struct({
    kind: Schema.Literal("email-verification"),
    payload: EmailVerificationEmailInput,
  }),
  Schema.Struct({
    kind: Schema.Literal("organization-invitation"),
    payload: OrganizationInvitationEmailInput,
  })
);

export type AuthEmailQueueMessage = Schema.Schema.Type<
  typeof AuthEmailQueueMessage
>;

const decodeAuthEmailQueueMessage = Schema.decodeUnknown(AuthEmailQueueMessage);

export function decodeAuthEmailQueueMessageEffect(input: unknown) {
  return decodeAuthEmailQueueMessage(input).pipe(
    Effect.catchTag("ParseError", (parseError) =>
      Effect.fail(
        new InvalidAuthEmailQueueMessageError({
          cause: formatParseError(parseError),
          message: "Invalid auth email queue message",
        })
      )
    )
  );
}

function scheduleAuthEmailQueueMessage(
  queue: Queue<unknown>,
  message: AuthEmailQueueMessage
) {
  return Effect.tryPromise({
    catch: (cause) =>
      new AuthenticationEmailSchedulingError({
        cause: serializeUnknownError(cause),
        deliveryKey: message.payload.deliveryKey,
        emailKind: message.kind,
        message: "Failed to schedule auth email queue message",
      }),
    try: () => queue.send(message),
  });
}

export function decodeAuthEmailQueueMessageStrict(input: unknown) {
  return Effect.runSync(decodeAuthEmailQueueMessageEffect(input));
}

export function makeCloudflareAuthenticationEmailSchedulerLive(
  queue: Queue<unknown>
) {
  return Layer.succeed(AuthenticationEmailScheduler, {
    sendPasswordResetEmail: (payload) =>
      scheduleAuthEmailQueueMessage(queue, { kind: "password-reset", payload }),
    sendVerificationEmail: (payload) =>
      scheduleAuthEmailQueueMessage(queue, {
        kind: "email-verification",
        payload,
      }),
    sendOrganizationInvitationEmail: (payload) =>
      scheduleAuthEmailQueueMessage(queue, {
        kind: "organization-invitation",
        payload,
      }),
  });
}

export const sendAuthEmailQueueMessage = Effect.fn(
  "AuthEmailQueue.sendMessage"
)(function* (message: AuthEmailQueueMessage) {
  const sender = yield* AuthEmailSender;

  return yield* Match.value(message).pipe(
    Match.when({ kind: "password-reset" }, (passwordResetMessage) =>
      mapAuthEmailQueueDelivery(
        passwordResetMessage,
        sender.sendPasswordResetEmail(passwordResetMessage.payload)
      )
    ),
    Match.when({ kind: "email-verification" }, (emailVerificationMessage) =>
      mapAuthEmailQueueDelivery(
        emailVerificationMessage,
        sender.sendEmailVerificationEmail(emailVerificationMessage.payload)
      )
    ),
    Match.when(
      { kind: "organization-invitation" },
      (organizationInvitationMessage) =>
        mapAuthEmailQueueDelivery(
          organizationInvitationMessage,
          sender.sendOrganizationInvitationEmail(
            organizationInvitationMessage.payload
          )
        )
    ),
    Match.exhaustive
  );
});

function formatParseError(parseError: ParseResult.ParseError) {
  return ParseResult.TreeFormatter.formatErrorSync(parseError);
}

type AuthEmailQueueDeliverySourceError =
  | EmailVerificationEmailError
  | OrganizationInvitationEmailError
  | PasswordResetEmailError;

function mapAuthEmailQueueDelivery(
  message: AuthEmailQueueMessage,
  send: Effect.Effect<void, AuthEmailQueueDeliverySourceError, never>
) {
  return send.pipe(
    Effect.catchAll((error) =>
      Effect.fail(
        new AuthEmailQueueDeliveryError({
          cause: serializeUnknownError(error),
          deliveryKey: message.payload.deliveryKey,
          emailKind: message.kind,
          message: "Auth email queue delivery failed",
          sourceCause: extractUnknownErrorCause(error),
          sourceTag: extractUnknownErrorTag(error),
        })
      )
    )
  );
}

function extractUnknownErrorCause(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    typeof error.cause === "string"
  ) {
    return error.cause;
  }
}

function extractUnknownErrorTag(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    typeof error._tag === "string"
  ) {
    return error._tag;
  }
}
