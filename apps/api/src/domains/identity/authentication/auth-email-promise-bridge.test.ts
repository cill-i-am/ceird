import { ConfigProvider, Effect } from "effect";

import { AuthEmailPromiseBridge } from "./auth-email-promise-bridge.js";

describe("auth email promise bridge", () => {
  it("supports a noop transport without Cloudflare credentials", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* AuthEmailPromiseBridgeEffect() {
        const bridge = yield* AuthEmailPromiseBridge;

        return yield* Effect.tryPromise(() =>
          bridge.sendEmailVerificationEmail({
            deliveryKey: "email-verification/test-delivery-key",
            recipientEmail: "person@example.com",
            recipientName: "Person Example",
            verificationUrl:
              "http://127.0.0.1:4173/verify-email?status=success",
          })
        );
      }).pipe(
        Effect.provide(AuthEmailPromiseBridge.Default),
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([
              ["AUTH_EMAIL_TRANSPORT", "noop"],
              ["AUTH_APP_ORIGIN", "http://127.0.0.1:4173"],
              ["AUTH_EMAIL_FROM", "auth@ceird.localhost"],
              ["AUTH_EMAIL_FROM_NAME", "Ceird"],
            ])
          )
        )
      )
    );

    expect(result).toBeUndefined();
  }, 10_000);
});
