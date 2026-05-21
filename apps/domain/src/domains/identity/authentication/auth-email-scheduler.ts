/* eslint-disable max-classes-per-file */
import { Context, Effect, Layer, Schema } from "effect";

import { AuthEmailSender, AuthEmailTransport } from "./auth-email.js";
import type {
  EmailVerificationEmailInput,
  EmailVerificationEmailError,
  OrganizationInvitationEmailError,
  OrganizationInvitationEmailInput,
  PasswordResetEmailInput,
  PasswordResetEmailError,
} from "./auth-email.js";

export class AuthenticationEmailSchedulingError extends Schema.TaggedErrorClass<AuthenticationEmailSchedulingError>()(
  "AuthenticationEmailSchedulingError",
  {
    cause: Schema.optional(Schema.String),
    deliveryKey: Schema.optional(Schema.String),
    emailKind: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export interface AuthenticationEmailSchedulerService {
  readonly sendPasswordResetEmail: (
    input: PasswordResetEmailInput
  ) => Effect.Effect<
    void,
    AuthenticationEmailSchedulingError | PasswordResetEmailError
  >;
  readonly sendVerificationEmail: (
    input: EmailVerificationEmailInput
  ) => Effect.Effect<
    void,
    AuthenticationEmailSchedulingError | EmailVerificationEmailError
  >;
  readonly sendOrganizationInvitationEmail: (
    input: OrganizationInvitationEmailInput
  ) => Effect.Effect<
    void,
    AuthenticationEmailSchedulingError | OrganizationInvitationEmailError
  >;
}

export class AuthenticationEmailScheduler extends Context.Service<
  AuthenticationEmailScheduler,
  AuthenticationEmailSchedulerService
>()("@ceird/domains/identity/authentication/AuthenticationEmailScheduler") {}

export const AuthenticationEmailSchedulerLive = Layer.effect(
  AuthenticationEmailScheduler,
  Effect.gen(function* AuthenticationEmailSchedulerLiveEffect() {
    const sender = yield* AuthEmailSender;

    return {
      sendPasswordResetEmail: sender.sendPasswordResetEmail,
      sendVerificationEmail: sender.sendEmailVerificationEmail,
      sendOrganizationInvitationEmail: sender.sendOrganizationInvitationEmail,
    } satisfies AuthenticationEmailSchedulerService;
  })
).pipe(
  Layer.provide(
    AuthEmailSender.Default.pipe(Layer.provideMerge(AuthEmailTransport.Local))
  )
);
