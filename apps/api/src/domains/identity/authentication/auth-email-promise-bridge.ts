import { Effect, Layer, Runtime } from "effect";

import { loadAuthEmailConfig } from "./auth-email-config.js";
import { AuthEmailConfigurationError } from "./auth-email-errors.js";
import { AuthEmailSender, AuthEmailTransport } from "./auth-email.js";
import type {
  EmailVerificationEmailInput,
  OrganizationInvitationEmailInput,
  PasswordResetEmailInput,
} from "./auth-email.js";
import { CloudflareAuthEmailTransportLive } from "./cloudflare-auth-email-transport.js";

export const NoopAuthEmailTransportLive = Layer.succeed(AuthEmailTransport, {
  send: () =>
    Effect.log("Auth email transport send skipped", {
      outcomeBucket: "noop",
      provider: "noop",
    }).pipe(Effect.asVoid),
});

const AuthenticationEmailTransportLive = Layer.unwrapEffect(
  Effect.gen(function* AuthenticationEmailTransportLiveLayer() {
    const { transportMode } = yield* loadAuthEmailConfig;

    switch (transportMode) {
      case "noop": {
        return NoopAuthEmailTransportLive;
      }
      case "cloudflare-api": {
        return CloudflareAuthEmailTransportLive;
      }
      case "cloudflare-binding": {
        return Layer.fail(
          new AuthEmailConfigurationError({
            message:
              "AUTH_EMAIL_TRANSPORT=cloudflare-binding requires the Cloudflare Worker entrypoint to provide an email binding transport",
          })
        );
      }
      default: {
        const exhaustive: never = transportMode;
        return exhaustive;
      }
    }
  })
);

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
  "@task-tracker/domains/identity/authentication/AuthEmailPromiseBridge",
  {
    accessors: true,
    dependencies: [
      AuthEmailSender.Default.pipe(
        Layer.provideMerge(AuthenticationEmailTransportLive)
      ),
    ],
    effect: makeAuthEmailPromiseBridgeEffect,
  }
) {}
