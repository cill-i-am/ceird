import { ConfigProvider, Effect } from "effect";
import type { CreateEmailResponse } from "resend";

import { AuthEmailDeliveryError } from "./auth-email-errors.js";
import type { TransportMessage } from "./auth-email.js";
import { makeResendAuthEmailTransport } from "./resend-auth-email-transport.js";

function makeConfigProvider() {
  return ConfigProvider.fromMap(
    new Map([
      ["AUTH_EMAIL_FROM", "auth@task-tracker.localhost"],
      ["AUTH_EMAIL_FROM_NAME", "Task Tracker Auth"],
      ["RESEND_API_KEY", "re_test_123"],
    ])
  );
}

function makeMessage(overrides?: Partial<TransportMessage>): TransportMessage {
  return {
    to: "alice@example.com",
    subject: "Reset your password",
    text: "Reset link",
    html: "<p>Reset link</p>",
    ...overrides,
  };
}

describe("makeResendAuthEmailTransport()", () => {
  it("uses the configured sender in the Resend payload", async () => {
    const sentPayloads: unknown[] = [];

    await Effect.runPromise(
      Effect.flatMap(
        makeResendAuthEmailTransport({
          resend: {
            emails: {
              send: (payload): Promise<CreateEmailResponse> => {
                sentPayloads.push(payload);

                return Promise.resolve({
                  data: { id: "email_123" },
                  error: null,
                  headers: null,
                });
              },
            },
          },
        }),
        (transport) => transport.send(makeMessage())
      ).pipe(Effect.withConfigProvider(makeConfigProvider()))
    );

    expect(sentPayloads).toStrictEqual([
      {
        from: "Task Tracker Auth <auth@task-tracker.localhost>",
        to: "alice@example.com",
        subject: "Reset your password",
        text: "Reset link",
        html: "<p>Reset link</p>",
      },
    ]);
  }, 10_000);

  it("maps resend failures into AuthEmailDeliveryError", async () => {
    const result = await Effect.runPromise(
      Effect.flatMap(
        makeResendAuthEmailTransport({
          resend: {
            emails: {
              send: (): Promise<CreateEmailResponse> =>
                Promise.resolve({
                  data: null,
                  error: {
                    message: "upstream timeout",
                    name: "application_error",
                    statusCode: 500,
                  },
                  headers: null,
                }),
            },
          },
        }),
        (transport) => transport.send(makeMessage())
      ).pipe(Effect.withConfigProvider(makeConfigProvider()), Effect.either)
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailDeliveryError);
    expect(result.left).toMatchObject({
      _tag: "AuthEmailDeliveryError",
      message: "Failed to send auth email via Resend",
      cause: "upstream timeout",
    });
  }, 10_000);

  it("maps rejected resend requests into AuthEmailDeliveryError", async () => {
    const result = await Effect.runPromise(
      Effect.flatMap(
        makeResendAuthEmailTransport({
          resend: {
            emails: {
              send: (): Promise<CreateEmailResponse> =>
                Promise.reject(new Error("socket hang up")),
            },
          },
        }),
        (transport) => transport.send(makeMessage())
      ).pipe(Effect.withConfigProvider(makeConfigProvider()), Effect.either)
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailDeliveryError);
    expect(result.left).toMatchObject({
      _tag: "AuthEmailDeliveryError",
      message: "Failed to send auth email via Resend",
      cause: "socket hang up",
    });
  }, 10_000);
});
