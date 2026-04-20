import { ConfigProvider, Effect, Layer } from "effect";

import { loadAuthEmailConfig } from "./auth-email-config.js";
import {
  AuthEmailConfigurationError,
  AuthEmailDeliveryError,
} from "./auth-email-errors.js";
import { AuthEmailSender, AuthEmailTransport } from "./auth-email.js";
import type { TransportMessage } from "./auth-email.js";

function makeAuthEmailSenderTestLayer(
  send: (
    message: TransportMessage
  ) => Effect.Effect<void, AuthEmailDeliveryError>
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
  it("composes the expected organization invitation message", async () => {
    const sentMessages: TransportMessage[] = [];

    const result = await Effect.runPromise(
      AuthEmailSender.sendOrganizationInvitationEmail({
        idempotencyKey: "organization-invitation/inv_123",
        recipientEmail: "member@example.com",
        recipientName: "Taylor Example",
        organizationName: "Acme Field Ops",
        inviterEmail: "owner@example.com",
        invitationUrl:
          "https://app.task-tracker.localhost/accept-invitation/inv_123",
        role: "member",
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
        idempotencyKey: "organization-invitation/inv_123",
        to: "member@example.com",
        subject: "Join Acme Field Ops on Task Tracker",
        text: [
          "Hello Taylor Example,",
          "",
          "owner@example.com invited you to join Acme Field Ops as a member.",
          "",
          "https://app.task-tracker.localhost/accept-invitation/inv_123",
        ].join("\n"),
        html: [
          "<p>Hello Taylor Example,</p>",
          "<p>owner@example.com invited you to join Acme Field Ops as a member.</p>",
          '<p><a href="https://app.task-tracker.localhost/accept-invitation/inv_123">Accept invitation</a></p>',
        ].join(""),
      },
    ]);
  }, 10_000);

  it("accepts the owner role used by Better Auth invitations", async () => {
    const sentMessages: TransportMessage[] = [];

    const result = await Effect.runPromise(
      AuthEmailSender.sendOrganizationInvitationEmail({
        idempotencyKey: "organization-invitation/inv_456",
        recipientEmail: "owner-invitee@example.com",
        recipientName: "Jordan Example",
        organizationName: "Northwind Ops",
        inviterEmail: "existing-owner@example.com",
        invitationUrl:
          "https://app.task-tracker.localhost/accept-invitation/inv_456",
        role: "owner",
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
    expect(sentMessages[0]?.text).toContain("as a owner.");
  }, 10_000);

  it("composes the expected password reset message", async () => {
    const sentMessages: TransportMessage[] = [];

    const result = await Effect.runPromise(
      AuthEmailSender.sendPasswordResetEmail({
        idempotencyKey: "password-reset/user-123/token-abc123",
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
        idempotencyKey: "password-reset/user-123/token-abc123",
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

  it("maps provider failures into PasswordResetDeliveryError", async () => {
    const result = await Effect.runPromise(
      AuthEmailSender.sendPasswordResetEmail({
        idempotencyKey: "password-reset/user-123/token-abc123",
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        resetUrl: "https://app.task-tracker.localhost/reset?token=abc123",
      }).pipe(
        Effect.either,
        Effect.provide(
          makeAuthEmailSenderTestLayer(() =>
            Effect.fail(
              new AuthEmailDeliveryError({
                message: "Provider request failed",
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

    expect(result.left).toMatchObject({
      _tag: "PasswordResetDeliveryError",
      message: "Failed to deliver password reset email",
      cause: "Provider request failed",
    });
  }, 10_000);

  it("rejects malformed runtime input before sending", async () => {
    const sentMessages: TransportMessage[] = [];

    const result = await Effect.runPromise(
      AuthEmailSender.sendPasswordResetEmail({
        idempotencyKey: "password-reset/user-123/token-abc123",
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
    expect(result.left).toMatchObject({
      _tag: "PasswordResetDeliveryError",
      message: "Invalid password reset email input",
    });
  }, 10_000);

  it("escapes html-sensitive values in the composed html body", async () => {
    const sentMessages: TransportMessage[] = [];

    await Effect.runPromise(
      AuthEmailSender.sendPasswordResetEmail({
        idempotencyKey: "password-reset/user-123/token-abc123",
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

describe("auth email sender email verification delivery", () => {
  it("composes the expected email verification message", async () => {
    const sentMessages: TransportMessage[] = [];

    const result = await Effect.runPromise(
      AuthEmailSender.sendEmailVerificationEmail({
        idempotencyKey: "email-verification/user-123/token-verify123",
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        verificationUrl:
          "https://app.task-tracker.localhost/verify-email?success=1",
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
        idempotencyKey: "email-verification/user-123/token-verify123",
        to: "alice@example.com",
        subject: "Verify your email",
        text: [
          "Hello Alice,",
          "",
          "Use this link to verify your email:",
          "https://app.task-tracker.localhost/verify-email?success=1",
        ].join("\n"),
        html: [
          "<p>Hello Alice,</p>",
          '<p><a href="https://app.task-tracker.localhost/verify-email?success=1">Verify your email</a></p>',
        ].join(""),
      },
    ]);
  }, 10_000);

  it("maps provider failures into EmailVerificationDeliveryError", async () => {
    const result = await Effect.runPromise(
      AuthEmailSender.sendEmailVerificationEmail({
        idempotencyKey: "email-verification/user-123/token-verify123",
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        verificationUrl:
          "https://app.task-tracker.localhost/verify-email?success=1",
      }).pipe(
        Effect.either,
        Effect.provide(
          makeAuthEmailSenderTestLayer(() =>
            Effect.fail(
              new AuthEmailDeliveryError({
                message: "Provider request failed",
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

    expect(result.left).toMatchObject({
      _tag: "EmailVerificationDeliveryError",
      message: "Failed to deliver verification email",
      cause: "Provider request failed",
    });
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
              ["AUTH_APP_ORIGIN", "https://app.task-tracker.localhost"],
              ["AUTH_EMAIL_FROM", "auth@task-tracker.localhost"],
              ["RESEND_API_KEY", "re_test_123"],
            ])
          )
        )
      )
    );

    expect(config).toStrictEqual({
      appOrigin: "https://app.task-tracker.localhost",
      from: "auth@task-tracker.localhost",
      fromName: "Task Tracker",
      resendApiKey: "re_test_123",
    });
  }, 10_000);

  it("requires AUTH_APP_ORIGIN in auth email config", async () => {
    const result = await Effect.runPromise(
      loadAuthEmailConfig.pipe(
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([
              ["AUTH_EMAIL_FROM", "auth@task-tracker.localhost"],
              ["RESEND_API_KEY", "re_test_123"],
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
    expect(result.left.cause).toMatch(/AUTH_APP_ORIGIN/);
  }, 10_000);

  it("maps config failures into AuthEmailConfigurationError", async () => {
    const result = await Effect.runPromise(
      loadAuthEmailConfig.pipe(
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([
              ["AUTH_APP_ORIGIN", "https://app.task-tracker.localhost"],
              ["AUTH_EMAIL_FROM", "auth@task-tracker.localhost"],
              ["RESEND_API_KEY", ""],
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
    expect(result.left.message).toBe("Invalid auth email configuration");
    expect(result.left.cause).toMatch(/RESEND_API_KEY/);
  }, 10_000);

  it("rejects invalid auth email sender addresses", async () => {
    const result = await Effect.runPromise(
      loadAuthEmailConfig.pipe(
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([
              ["AUTH_APP_ORIGIN", "https://app.task-tracker.localhost"],
              ["AUTH_EMAIL_FROM", "not-an-email"],
              ["RESEND_API_KEY", "re_test_123"],
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
