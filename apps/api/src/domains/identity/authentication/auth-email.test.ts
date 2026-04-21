import { ConfigProvider, Effect, Layer } from "effect";

import { loadAuthEmailConfig } from "./auth-email-config.js";
import {
  AuthEmailConfigurationError,
  AuthEmailRejectedError,
  AuthEmailRequestError,
  InvalidPasswordResetEmailInputError,
  PasswordResetEmailRejectedError,
  PasswordResetEmailRequestError,
} from "./auth-email-errors.js";
import { AuthEmailSender, AuthEmailTransport } from "./auth-email.js";
import type { TransportMessage } from "./auth-email.js";

const PASSWORD_RESET_DELIVERY_KEY =
  "password-reset/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function makeAuthEmailSenderTestLayer(
  send: (
    message: TransportMessage
  ) => Effect.Effect<void, AuthEmailRequestError | AuthEmailRejectedError>
) {
  return AuthEmailSender.Default.pipe(
    Layer.provide(
      Layer.succeed(AuthEmailTransport, {
        send,
      })
    )
  );
}

describe("auth email sender password reset delivery", () => {
  it("composes the expected password reset message", async () => {
    const sentMessages: TransportMessage[] = [];

    const result = await Effect.runPromise(
      AuthEmailSender.sendPasswordResetEmail({
        deliveryKey: PASSWORD_RESET_DELIVERY_KEY,
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        resetUrl: "https://app.task-tracker.localhost/reset?token=abc123",
      }).pipe(
        Effect.provide(
          makeAuthEmailSenderTestLayer((message) =>
            Effect.sync(() => {
              sentMessages.push(message);
            })
          )
        )
      )
    );

    expect(result).toBeUndefined();
    expect(sentMessages).toStrictEqual([
      {
        deliveryKey: PASSWORD_RESET_DELIVERY_KEY,
        to: "alice@example.com",
        subject: "Reset your password",
        text: [
          "Hello Alice,",
          "",
          "Use this link to reset your password:",
          "https://app.task-tracker.localhost/reset?token=abc123",
        ].join("\n"),
        html: [
          "<p>Hello Alice,</p>",
          '<p><a href="https://app.task-tracker.localhost/reset?token=abc123">Reset your password</a></p>',
        ].join(""),
      },
    ]);
  }, 10_000);

  it("maps provider request failures into PasswordResetEmailRequestError", async () => {
    const result = await Effect.runPromise(
      AuthEmailSender.sendPasswordResetEmail({
        deliveryKey: PASSWORD_RESET_DELIVERY_KEY,
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        resetUrl: "https://app.task-tracker.localhost/reset?token=abc123",
      }).pipe(
        Effect.either,
        Effect.provide(
          makeAuthEmailSenderTestLayer(() =>
            Effect.fail(
              new AuthEmailRequestError({
                message: "Auth email request failed",
                cause: "upstream timeout",
              })
            )
          )
        )
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(PasswordResetEmailRequestError);
    expect(result.left).toMatchObject({
      _tag: "PasswordResetEmailRequestError",
      message: "Failed to deliver password reset email",
      cause: "upstream timeout",
    });
  }, 10_000);

  it("rejects malformed runtime input before sending", async () => {
    const sentMessages: TransportMessage[] = [];

    const result = await Effect.runPromise(
      AuthEmailSender.sendPasswordResetEmail({
        deliveryKey: PASSWORD_RESET_DELIVERY_KEY,
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        resetUrl:
          "https://user:password@app.task-tracker.localhost/reset?token=abc123",
      } as never).pipe(
        Effect.either,
        Effect.provide(
          makeAuthEmailSenderTestLayer((message) =>
            Effect.sync(() => {
              sentMessages.push(message);
            })
          )
        )
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(sentMessages).toStrictEqual([]);
    expect(result.left).toBeInstanceOf(InvalidPasswordResetEmailInputError);
    expect(result.left).toMatchObject({
      _tag: "InvalidPasswordResetEmailInputError",
      message: "Invalid password reset email input",
    });
  }, 10_000);

  it("rejects unsafe delivery keys before sending", async () => {
    const sentMessages: TransportMessage[] = [];

    const result = await Effect.runPromise(
      AuthEmailSender.sendPasswordResetEmail({
        deliveryKey: "password-reset/user-123/token-abc123",
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        resetUrl: "https://app.task-tracker.localhost/reset?token=abc123",
      } as never).pipe(
        Effect.either,
        Effect.provide(
          makeAuthEmailSenderTestLayer((message) =>
            Effect.sync(() => {
              sentMessages.push(message);
            })
          )
        )
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(sentMessages).toStrictEqual([]);
    expect(result.left).toBeInstanceOf(InvalidPasswordResetEmailInputError);
    expect(result.left).toMatchObject({
      _tag: "InvalidPasswordResetEmailInputError",
      message: "Invalid password reset email input",
    });
    expect(result.left.cause).toMatch(
      /password reset delivery key in the format password-reset\/<sha256>/
    );
  }, 10_000);

  it("maps provider rejections into PasswordResetEmailRejectedError", async () => {
    const result = await Effect.runPromise(
      AuthEmailSender.sendPasswordResetEmail({
        deliveryKey: PASSWORD_RESET_DELIVERY_KEY,
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        resetUrl: "https://app.task-tracker.localhost/reset?token=abc123",
      }).pipe(
        Effect.either,
        Effect.provide(
          makeAuthEmailSenderTestLayer(() =>
            Effect.fail(
              new AuthEmailRejectedError({
                message: "Auth email was rejected",
                cause: "recipient address rejected",
              })
            )
          )
        )
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(PasswordResetEmailRejectedError);
    expect(result.left).toMatchObject({
      _tag: "PasswordResetEmailRejectedError",
      message: "Password reset email was rejected for delivery",
      cause: "recipient address rejected",
    });
  }, 10_000);

  it("escapes html-sensitive values in the composed html body", async () => {
    const sentMessages: TransportMessage[] = [];

    await Effect.runPromise(
      AuthEmailSender.sendPasswordResetEmail({
        deliveryKey: PASSWORD_RESET_DELIVERY_KEY,
        recipientEmail: "alice@example.com",
        recipientName: 'Alice & <Admin> "Boss"',
        resetUrl:
          "https://app.task-tracker.localhost/reset?token=abc&next=%2Fhome",
      }).pipe(
        Effect.provide(
          makeAuthEmailSenderTestLayer((message) =>
            Effect.sync(() => {
              sentMessages.push(message);
            })
          )
        )
      )
    );

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]?.html).toBe(
      '<p>Hello Alice &amp; &lt;Admin&gt; &quot;Boss&quot;,</p><p><a href="https://app.task-tracker.localhost/reset?token=abc&amp;next=%2Fhome">Reset your password</a></p>'
    );
    expect(sentMessages[0]?.html).not.toContain("<Admin>");
    expect(sentMessages[0]?.html).toContain("&amp;next=%2Fhome");
  }, 10_000);
});

describe("auth email config loading", () => {
  it("requires auth email config through Config", async () => {
    const result = await Effect.runPromise(
      loadAuthEmailConfig.pipe(
        Effect.withConfigProvider(ConfigProvider.fromMap(new Map())),
        Effect.either
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailConfigurationError);
    expect(result.left.cause).toMatch(/AUTH_EMAIL_FROM/);
  }, 10_000);

  it("loads auth email config with defaults", async () => {
    const config = await Effect.runPromise(
      loadAuthEmailConfig.pipe(
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([
              ["AUTH_EMAIL_FROM", "auth@task-tracker.localhost"],
              ["CLOUDFLARE_ACCOUNT_ID", "account_123"],
              ["CLOUDFLARE_API_TOKEN", "token_123"],
            ])
          )
        )
      )
    );

    expect(config).toStrictEqual({
      from: "auth@task-tracker.localhost",
      fromName: "Task Tracker",
      cloudflareAccountId: "account_123",
      cloudflareApiToken: "token_123",
    });
  }, 10_000);

  it("fails when required cloudflare auth email env vars are missing", async () => {
    const result = await Effect.runPromise(
      loadAuthEmailConfig.pipe(
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([["AUTH_EMAIL_FROM", "auth@task-tracker.localhost"]])
          )
        ),
        Effect.either
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailConfigurationError);
    expect(result.left.message).toBe("Invalid auth email configuration");
    expect(result.left.cause).toMatch(
      /CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN/
    );
  }, 10_000);

  it("rejects invalid auth email sender addresses", async () => {
    const result = await Effect.runPromise(
      loadAuthEmailConfig.pipe(
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([
              ["AUTH_EMAIL_FROM", "not-an-email"],
              ["CLOUDFLARE_ACCOUNT_ID", "account_123"],
              ["CLOUDFLARE_API_TOKEN", "token_123"],
            ])
          )
        ),
        Effect.either
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailConfigurationError);
    expect(result.left.cause).toMatch(/AUTH_EMAIL_FROM/);
    expect(result.left.cause).toMatch(/valid email/i);
  }, 10_000);
});
