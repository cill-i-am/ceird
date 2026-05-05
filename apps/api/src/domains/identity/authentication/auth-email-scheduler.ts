import { Context, Effect, Layer } from "effect";

import { AuthEmailPromiseBridge } from "./auth-email-promise-bridge.js";
import type {
  EmailVerificationEmailInput,
  OrganizationInvitationEmailInput,
  PasswordResetEmailInput,
} from "./auth-email.js";

export interface AuthenticationEmailSchedulerService {
  readonly sendPasswordResetEmail: (
    input: PasswordResetEmailInput
  ) => Promise<void>;
  readonly sendVerificationEmail: (
    input: EmailVerificationEmailInput
  ) => Promise<void>;
  readonly sendOrganizationInvitationEmail: (
    input: OrganizationInvitationEmailInput
  ) => Promise<void>;
}

export class AuthenticationEmailScheduler extends Context.Tag(
  "@ceird/domains/identity/authentication/AuthenticationEmailScheduler"
)<AuthenticationEmailScheduler, AuthenticationEmailSchedulerService>() {}

export const AuthenticationEmailSchedulerLive = Layer.effect(
  AuthenticationEmailScheduler,
  Effect.gen(function* AuthenticationEmailSchedulerLiveEffect() {
    const bridge = yield* AuthEmailPromiseBridge;

    return {
      sendPasswordResetEmail: bridge.send,
      sendVerificationEmail: bridge.sendEmailVerificationEmail,
      sendOrganizationInvitationEmail: bridge.sendOrganizationInvitationEmail,
    } satisfies AuthenticationEmailSchedulerService;
  })
).pipe(Layer.provide(AuthEmailPromiseBridge.Default));
