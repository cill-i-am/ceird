/* eslint-disable max-classes-per-file */
import { Effect, Layer, Schema } from "effect";

import { AuthenticationEmailScheduler } from "./auth-email-scheduler.js";
import {
  AuthEmailSender,
  EmailVerificationEmailInput,
  OrganizationInvitationEmailInput,
  PasswordResetEmailInput,
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
    Effect.mapError(
      () =>
        new InvalidAuthEmailQueueMessageError({
          cause: "Auth email queue message failed schema validation",
          message: "Invalid auth email queue message",
        })
    )
  );
}

export function decodeAuthEmailQueueMessageStrict(input: unknown) {
  return Effect.runSync(decodeAuthEmailQueueMessageEffect(input));
}

export function makeCloudflareAuthenticationEmailSchedulerLive(
  queue: Queue<AuthEmailQueueMessage>
) {
  return Layer.succeed(AuthenticationEmailScheduler, {
    sendPasswordResetEmail: async (payload) => {
      await queue.send({ kind: "password-reset", payload });
    },
    sendVerificationEmail: async (payload) => {
      await queue.send({ kind: "email-verification", payload });
    },
    sendOrganizationInvitationEmail: async (payload) => {
      await queue.send({ kind: "organization-invitation", payload });
    },
  });
}

export const sendAuthEmailQueueMessage = Effect.fn(
  "AuthEmailQueue.sendMessage"
)(function* (message: AuthEmailQueueMessage) {
  const sender = yield* AuthEmailSender;

  switch (message.kind) {
    case "password-reset": {
      return yield* mapAuthEmailQueueDelivery(
        message,
        sender.sendPasswordResetEmail(message.payload)
      );
    }
    case "email-verification": {
      return yield* mapAuthEmailQueueDelivery(
        message,
        sender.sendEmailVerificationEmail(message.payload)
      );
    }
    case "organization-invitation": {
      return yield* mapAuthEmailQueueDelivery(
        message,
        sender.sendOrganizationInvitationEmail(message.payload)
      );
    }
    default: {
      const exhaustive: never = message;
      return exhaustive;
    }
  }
});

function mapAuthEmailQueueDelivery(
  message: AuthEmailQueueMessage,
  send: Effect.Effect<void, unknown, never>
) {
  return send.pipe(
    Effect.mapError(
      (error) =>
        new AuthEmailQueueDeliveryError({
          cause: serializeUnknownError(error),
          deliveryKey: message.payload.deliveryKey,
          emailKind: message.kind,
          message: "Auth email queue delivery failed",
          sourceCause: extractUnknownErrorCause(error),
          sourceTag: extractUnknownErrorTag(error),
        })
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

function serializeUnknownError(error: unknown) {
  if (typeof error === "object" && error !== null) {
    if ("_tag" in error && typeof error._tag === "string") {
      return error._tag;
    }
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
  }
  return String(error);
}
