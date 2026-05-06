import { Effect } from "effect";

import type { AuthEmailQueueMessage } from "./auth-email-queue.js";
import {
  decodeAuthEmailQueueMessageStrict,
  makeCloudflareAuthenticationEmailSchedulerLive,
} from "./auth-email-queue.js";
import { AuthenticationEmailScheduler } from "./auth-email-scheduler.js";

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

  it("decodes queue trace context for async Sentry continuation", () => {
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
        traceContext: {
          baggage: "sentry-environment=production",
          sentryTrace: "0123456789abcdef0123456789abcdef-0123456789abcdef-1",
        },
      })
    ).toMatchObject({
      kind: "password-reset",
      traceContext: {
        baggage: "sentry-environment=production",
        sentryTrace: "0123456789abcdef0123456789abcdef-0123456789abcdef-1",
      },
    });
  }, 1000);

  it("adds the current Sentry trace context to scheduled auth email messages", async () => {
    const send = vi.fn<Queue<AuthEmailQueueMessage>["send"]>();
    send.mockResolvedValue({
      metadata: {
        metrics: {
          backlogBytes: 0,
          backlogCount: 0,
        },
      },
    });

    const scheduler = await Effect.runPromise(
      AuthenticationEmailScheduler.pipe(
        Effect.provide(
          makeCloudflareAuthenticationEmailSchedulerLive(
            { send } as unknown as Queue<AuthEmailQueueMessage>,
            {
              captureTraceContext: () => ({
                baggage: "sentry-environment=production",
                sentryTrace:
                  "0123456789abcdef0123456789abcdef-0123456789abcdef-1",
              }),
            }
          )
        )
      )
    );

    await scheduler.sendPasswordResetEmail({
      deliveryKey:
        "password-reset/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      recipientEmail: "user@example.com",
      recipientName: "User",
      resetUrl: "https://app.example.com/reset-password?token=abc",
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "password-reset",
        traceContext: {
          baggage: "sentry-environment=production",
          sentryTrace: "0123456789abcdef0123456789abcdef-0123456789abcdef-1",
        },
      })
    );
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
});
