import { Effect } from "effect";

import {
  configProviderFromMap,
  withConfigProvider,
} from "../../../test/effect-test-helpers.js";
import { AuthEmailPromiseBridge } from "./auth-email-promise-bridge.js";

describe("auth email promise bridge", () => {
  it("supports development transport without Cloudflare credentials", async () => {
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
        withConfigProvider(
          configProviderFromMap(
            new Map([
              ["AUTH_APP_ORIGIN", "http://127.0.0.1:4173"],
              ["AUTH_EMAIL_FROM", "auth@ceird.localhost"],
              ["AUTH_EMAIL_FROM_NAME", "Ceird"],
            ])
          )
        )
      ) as Effect.Effect<void, unknown, never>
    );

    expect(result).toBeUndefined();
  }, 10_000);
});
