import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  configProviderFromMap,
  withConfigProvider,
} from "../../../test/effect-test-helpers.js";
import { AuthEmailTransport } from "./auth-email-transport.js";
import type { TransportMessage } from "./auth-email-transport.js";

const message = {
  deliveryKey: "email-verification/test-delivery-key",
  html: "<p>Hello</p>",
  subject: "Verify your email",
  text: "Hello",
  to: "person@example.com",
} satisfies TransportMessage;

function runWithConfig<A, E>(
  effect: Effect.Effect<A, E, unknown>,
  config: Map<string, string>
) {
  return Effect.runPromise(
    effect.pipe(
      withConfigProvider(configProviderFromMap(config))
    ) as Effect.Effect<A, E, never>
  );
}

describe("auth email transport provider layers", () => {
  it("local layer uses deterministic development delivery", async () => {
    await expect(
      runWithConfig(
        AuthEmailTransport.send(message).pipe(
          Effect.provide(AuthEmailTransport.Local)
        ),
        new Map([
          ["AUTH_APP_ORIGIN", "https://app.ceird.localhost"],
          ["AUTH_EMAIL_FROM", "auth@ceird.localhost"],
        ])
      )
    ).resolves.toBeUndefined();
  }, 10_000);
});
