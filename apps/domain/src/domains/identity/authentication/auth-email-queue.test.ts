import { vi } from "@effect/vitest";
import { Effect } from "effect";

import {
  decodeAuthEmailQueueMessageStrict,
  InvalidAuthEmailQueueMessageError,
  INVALID_AUTH_EMAIL_QUEUE_MESSAGE_ERROR_TAG,
  makeCloudflareAuthenticationEmailSchedulerLive,
} from "./auth-email-queue.js";
import { AuthenticationEmailScheduler } from "./auth-email-scheduler.js";
import {
  makeAuthenticationRequestObservation,
  runWithAuthenticationRequestObservation,
} from "./auth-observability.js";

describe("auth email queue messages", () => {
  it("decodes password reset messages", () => {
    expect(
      decodeAuthEmailQueueMessageStrict({
        kind: "password-reset",
        payload: {
          deliveryKey:
            "password-reset/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          recipientEmail: "user@example.com",
          recipientName: "User",
          resetUrl: "https://app.example.com/reset-password?token=abc",
        },
      })
    ).toMatchObject({ kind: "password-reset" });
  }, 1000);

  it("rejects malformed messages", () => {
    expect(() =>
      decodeAuthEmailQueueMessageStrict({
        kind: "password-reset",
        payload: {
          recipientEmail: "not-an-email",
        },
      })
    ).toThrow("Invalid auth email queue message");
  }, 1000);

  it("uses reverse-domain tags for queue decode errors", () => {
    const error = new InvalidAuthEmailQueueMessageError({
      cause: "bad input",
      message: "Invalid auth email queue message",
    });

    expect(error._tag).toBe(INVALID_AUTH_EMAIL_QUEUE_MESSAGE_ERROR_TAG);
  });

  it("records queue send timing in the active request observation", async () => {
    const queue = {
      send: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Queue<unknown>;
    const observation = makeAuthenticationRequestObservation();

    await runWithAuthenticationRequestObservation(observation, () =>
      Effect.runPromise(
        Effect.gen(function* scheduleVerificationEmail() {
          const scheduler = yield* AuthenticationEmailScheduler;

          yield* scheduler.sendVerificationEmail({
            deliveryKey:
              "email-verification/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            recipientEmail: "user@example.com",
            recipientName: "User",
            verificationUrl: "https://app.example.com/verify?token=abc",
          });
        }).pipe(
          Effect.provide(makeCloudflareAuthenticationEmailSchedulerLive(queue))
        )
      )
    );

    expect(queue.send).toHaveBeenCalledOnce();
    expect(observation.timings).toMatchObject({
      "auth.emailQueueSendMs": expect.any(Number),
    });
  }, 1000);
});
