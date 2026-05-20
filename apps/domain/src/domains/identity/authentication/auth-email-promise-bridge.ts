import { Context, Effect, Layer } from "effect";

import { AuthEmailSender, AuthEmailTransport } from "./auth-email.js";
import type {
  EmailVerificationEmailInput,
  OrganizationInvitationEmailInput,
  PasswordResetEmailInput,
} from "./auth-email.js";

const makeAuthEmailPromiseBridgeEffect = Effect.gen(
  function* AuthEmailPromiseBridgeLive() {
    const context = yield* Effect.context<AuthEmailSender>();
    const runAuthEmail = Effect.runPromiseWith(context);

    return {
      sendEmailVerificationEmail: (input: EmailVerificationEmailInput) =>
        runAuthEmail(AuthEmailSender.sendEmailVerificationEmail(input)),
      sendOrganizationInvitationEmail: (
        input: OrganizationInvitationEmailInput
      ) => runAuthEmail(AuthEmailSender.sendOrganizationInvitationEmail(input)),
      send: (input: PasswordResetEmailInput) =>
        runAuthEmail(AuthEmailSender.sendPasswordResetEmail(input)),
    };
  }
);

export class AuthEmailPromiseBridge extends Context.Service<AuthEmailPromiseBridge>()(
  "@ceird/domains/identity/authentication/AuthEmailPromiseBridge",
  {
    make: makeAuthEmailPromiseBridgeEffect,
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    AuthEmailPromiseBridge,
    AuthEmailPromiseBridge.make
  );
  static readonly Default =
    AuthEmailPromiseBridge.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.mergeAll(
          AuthEmailSender.Default.pipe(
            Layer.provideMerge(AuthEmailTransport.Local)
          )
        )
      )
    );
}
