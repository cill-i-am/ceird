/* eslint-disable max-classes-per-file */
import { Effect, Layer, ParseResult, Schema } from "effect";

import { AuthEmailPromiseBridge } from "./auth-email-promise-bridge.js";
import { AuthenticationEmailScheduler } from "./auth-email-scheduler.js";
import {
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
    message: Schema.String,
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
      (error) =>
        new InvalidAuthEmailQueueMessageError({
          cause: formatParseError(error),
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

export function sendAuthEmailQueueMessage(message: AuthEmailQueueMessage) {
  return Effect.gen(function* sendAuthEmailQueueMessageEffect() {
    const bridge = yield* AuthEmailPromiseBridge;

    switch (message.kind) {
      case "password-reset": {
        return yield* tryAuthEmailQueueDelivery(() =>
          bridge.send(message.payload)
        );
      }
      case "email-verification": {
        return yield* tryAuthEmailQueueDelivery(() =>
          bridge.sendEmailVerificationEmail(message.payload)
        );
      }
      case "organization-invitation": {
        return yield* tryAuthEmailQueueDelivery(() =>
          bridge.sendOrganizationInvitationEmail(message.payload)
        );
      }
      default: {
        const exhaustive: never = message;
        return exhaustive;
      }
    }
  });
}

function formatParseError(parseError: ParseResult.ParseError) {
  return ParseResult.TreeFormatter.formatErrorSync(parseError);
}

function tryAuthEmailQueueDelivery(send: () => Promise<void>) {
  return Effect.tryPromise({
    try: send,
    catch: (error) =>
      new AuthEmailQueueDeliveryError({
        cause: serializeUnknownError(error),
        message: "Auth email queue delivery failed",
      }),
  });
}

function serializeUnknownError(error: unknown) {
  if (typeof error === "object" && error !== null) {
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
    if ("_tag" in error && typeof error._tag === "string") {
      return error._tag;
    }
  }
  return String(error);
}
