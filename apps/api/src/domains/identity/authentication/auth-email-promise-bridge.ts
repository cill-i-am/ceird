import { Context, Effect, Layer, Runtime } from "effect";

import { AuthEmailSender } from "./auth-email.js";
import type { PasswordResetEmailInput } from "./auth-email.js";
import { CloudflareAuthEmailTransportLive } from "./cloudflare-auth-email-transport.js";

// The auth domain depends on the sender service; the concrete Cloudflare
// transport stays injected at this infrastructure edge.
const AuthenticationEmailSenderLive = Layer.provide(AuthEmailSender.Default, [
  CloudflareAuthEmailTransportLive,
]);

export class PasswordResetEmailPromiseBridge extends Context.Tag(
  "@task-tracker/domains/identity/authentication/PasswordResetEmailPromiseBridge"
)<
  PasswordResetEmailPromiseBridge,
  {
    readonly send: (input: PasswordResetEmailInput) => Promise<void>;
  }
>() {}

export const PasswordResetEmailPromiseBridgeLive = Layer.effect(
  PasswordResetEmailPromiseBridge,
  Effect.gen(function* PasswordResetEmailPromiseBridgeLive() {
    const runtime = yield* Effect.runtime<AuthEmailSender>();
    const runPromise = Runtime.runPromise(runtime);

    return {
      send: (input: PasswordResetEmailInput) =>
        runPromise(AuthEmailSender.sendPasswordResetEmail(input)),
    };
  })
).pipe(Layer.provide(AuthenticationEmailSenderLive));
