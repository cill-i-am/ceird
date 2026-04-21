import { Effect, Layer, Runtime } from "effect";

import { AuthEmailSender } from "./auth-email.js";
import type {
  EmailVerificationEmailInput,
  OrganizationInvitationEmailInput,
  PasswordResetEmailInput,
} from "./auth-email.js";
import { CloudflareAuthEmailTransportLive } from "./cloudflare-auth-email-transport.js";

const AuthenticationEmailSenderLive = AuthEmailSender.Default.pipe(
  Layer.provideMerge(CloudflareAuthEmailTransportLive)
);

export class AuthEmailPromiseBridge extends Effect.Service<AuthEmailPromiseBridge>()(
  "@task-tracker/domains/identity/authentication/AuthEmailPromiseBridge",
  {
    accessors: true,
    dependencies: [AuthenticationEmailSenderLive],
    effect: Effect.gen(function* AuthEmailPromiseBridgeLive() {
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
    }),
  }
) {}
