import { Effect, Layer, Runtime } from "effect";

import { AuthEmailSender, AuthEmailTransport } from "./auth-email.js";
import type {
  EmailVerificationEmailInput,
  OrganizationInvitationEmailInput,
  PasswordResetEmailInput,
} from "./auth-email.js";

const makeAuthEmailPromiseBridgeEffect = Effect.gen(
  function* AuthEmailPromiseBridgeLive() {
    const runtime = yield* Effect.runtime<AuthEmailSender>();
    const runPromise = Runtime.runPromise(runtime);

    return {
      sendEmailVerificationEmail: (input: EmailVerificationEmailInput) =>
        runPromise(AuthEmailSender.sendEmailVerificationEmail(input)),
      sendOrganizationInvitationEmail: (
        input: OrganizationInvitationEmailInput
      ) => runPromise(AuthEmailSender.sendOrganizationInvitationEmail(input)),
      send: (input: PasswordResetEmailInput) =>
        runPromise(AuthEmailSender.sendPasswordResetEmail(input)),
    };
  }
);

export class AuthEmailPromiseBridge extends Effect.Service<AuthEmailPromiseBridge>()(
  "@ceird/domains/identity/authentication/AuthEmailPromiseBridge",
  {
    accessors: true,
    dependencies: [
      AuthEmailSender.Default.pipe(
        Layer.provideMerge(AuthEmailTransport.Local)
      ),
    ],
    effect: makeAuthEmailPromiseBridgeEffect,
  }
) {}
