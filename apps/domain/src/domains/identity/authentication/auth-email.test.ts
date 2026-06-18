import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import {
  configProviderFromMap,
  effectEither,
  withConfigProvider,
} from "../../../test/effect-test-helpers.js";
import { loadAuthEmailConfig } from "./auth-email-config.js";
import {
  AuthEmailConfigurationError,
  AUTH_EMAIL_CONFIGURATION_ERROR_TAG,
  AuthEmailRejectedError,
  AUTH_EMAIL_REJECTED_ERROR_TAG,
  AuthEmailRequestError,
  AUTH_EMAIL_REQUEST_ERROR_TAG,
  EmailVerificationEmailRejectedError,
  EMAIL_VERIFICATION_EMAIL_REJECTED_ERROR_TAG,
  EmailVerificationEmailRequestError,
  EMAIL_VERIFICATION_EMAIL_REQUEST_ERROR_TAG,
  InvalidEmailVerificationEmailInputError,
  INVALID_EMAIL_VERIFICATION_EMAIL_INPUT_ERROR_TAG,
  InvalidOrganizationInvitationEmailInputError,
  INVALID_ORGANIZATION_INVITATION_EMAIL_INPUT_ERROR_TAG,
  InvalidPasswordResetEmailInputError,
  INVALID_PASSWORD_RESET_EMAIL_INPUT_ERROR_TAG,
  OrganizationInvitationEmailRejectedError,
  ORGANIZATION_INVITATION_EMAIL_REJECTED_ERROR_TAG,
  OrganizationInvitationEmailRequestError,
  ORGANIZATION_INVITATION_EMAIL_REQUEST_ERROR_TAG,
  PasswordResetEmailRejectedError,
  PASSWORD_RESET_EMAIL_REJECTED_ERROR_TAG,
  PasswordResetEmailRequestError,
  PASSWORD_RESET_EMAIL_REQUEST_ERROR_TAG,
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
  it("uses reverse-domain tags for auth email errors", () => {
    expect(
      new AuthEmailConfigurationError({ message: "Invalid config" })._tag
    ).toBe(AUTH_EMAIL_CONFIGURATION_ERROR_TAG);
    expect(new AuthEmailRequestError({ message: "Request failed" })._tag).toBe(
      AUTH_EMAIL_REQUEST_ERROR_TAG
    );
    expect(new AuthEmailRejectedError({ message: "Rejected" })._tag).toBe(
      AUTH_EMAIL_REJECTED_ERROR_TAG
    );
  });

  it("composes the expected organization invitation message", async () => {
    const sentMessages: TransportMessage[] = [];

    const result = await Effect.runPromise(
      AuthEmailSender.sendOrganizationInvitationEmail({
        deliveryKey: "organization-invitation/inv_123",
        recipientEmail: "member@example.com",
        recipientName: "Taylor Example",
        organizationName: "Acme Field Ops",
        inviterEmail: "owner@example.com",
        invitationUrl: "https://app.ceird.localhost/accept-invitation/inv_123",
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
        deliveryKey: "organization-invitation/inv_123",
        to: "member@example.com",
        subject: "Join Acme Field Ops on Ceird",
        text: [
          "Hello Taylor Example,",
          "",
          "owner@example.com invited you to join Acme Field Ops as a member.",
          "",
          "https://app.ceird.localhost/accept-invitation/inv_123",
        ].join("\n"),
        html: [
          "<p>Hello Taylor Example,</p>",
          "<p>owner@example.com invited you to join Acme Field Ops as a member.</p>",
          '<p><a href="https://app.ceird.localhost/accept-invitation/inv_123">Accept invitation</a></p>',
        ].join(""),
      },
    ]);
  }, 10_000);

  it("rejects owner organization invitation emails before sending", async () => {
    const sentMessages: TransportMessage[] = [];

    const result = await Effect.runPromise(
      AuthEmailSender.sendOrganizationInvitationEmail({
        deliveryKey: "organization-invitation/inv_456",
        recipientEmail: "owner-invitee@example.com",
        recipientName: "Jordan Example",
        organizationName: "Northwind Ops",
        inviterEmail: "existing-owner@example.com",
        invitationUrl: "https://app.ceird.localhost/accept-invitation/inv_456",
        role: "owner",
      }).pipe(
        effectEither,
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
    expect(result.left).toBeInstanceOf(
      InvalidOrganizationInvitationEmailInputError
    );
  }, 10_000);

  it("rejects invalid organization invitation input before sending", async () => {
    const sentMessages: TransportMessage[] = [];

    const result = await Effect.runPromise(
      AuthEmailSender.sendOrganizationInvitationEmail({
        deliveryKey: "organization-invitation/inv_789",
        recipientEmail: "member@example.com",
        recipientName: "Taylor Example",
        organizationName: "Acme Field Ops",
        inviterEmail: "owner@example.com",
        invitationUrl:
          "https://user:password@app.ceird.localhost/accept-invitation/inv_789",
        role: "member",
      } as never).pipe(
        effectEither,
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
    expect(result.left).toBeInstanceOf(
      InvalidOrganizationInvitationEmailInputError
    );
    expect(result.left).toMatchObject({
      _tag: INVALID_ORGANIZATION_INVITATION_EMAIL_INPUT_ERROR_TAG,
      message: "Invalid organization invitation email input",
    });
  }, 10_000);

  it("maps organization invitation provider request failures into OrganizationInvitationEmailRequestError", async () => {
    const result = await Effect.runPromise(
      AuthEmailSender.sendOrganizationInvitationEmail({
        deliveryKey: "organization-invitation/inv_req",
        recipientEmail: "member@example.com",
        recipientName: "Taylor Example",
        organizationName: "Acme Field Ops",
        inviterEmail: "owner@example.com",
        invitationUrl: "https://app.ceird.localhost/accept-invitation/inv_req",
        role: "member",
      }).pipe(
        effectEither,
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

    expect(result.left).toBeInstanceOf(OrganizationInvitationEmailRequestError);
    expect(result.left).toMatchObject({
      _tag: ORGANIZATION_INVITATION_EMAIL_REQUEST_ERROR_TAG,
      message: "Failed to deliver organization invitation email",
      cause: "upstream timeout",
    });
  }, 10_000);

  it("maps organization invitation provider rejections into OrganizationInvitationEmailRejectedError", async () => {
    const result = await Effect.runPromise(
      AuthEmailSender.sendOrganizationInvitationEmail({
        deliveryKey: "organization-invitation/inv_rejected",
        recipientEmail: "member@example.com",
        recipientName: "Taylor Example",
        organizationName: "Acme Field Ops",
        inviterEmail: "owner@example.com",
        invitationUrl:
          "https://app.ceird.localhost/accept-invitation/inv_rejected",
        role: "member",
      }).pipe(
        effectEither,
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

    expect(result.left).toBeInstanceOf(
      OrganizationInvitationEmailRejectedError
    );
    expect(result.left).toMatchObject({
      _tag: ORGANIZATION_INVITATION_EMAIL_REJECTED_ERROR_TAG,
      message: "Organization invitation email was rejected for delivery",
      cause: "recipient address rejected",
    });
  }, 10_000);

  it("composes the expected password reset message", async () => {
    const sentMessages: TransportMessage[] = [];

    const result = await Effect.runPromise(
      AuthEmailSender.sendPasswordResetEmail({
        deliveryKey: PASSWORD_RESET_DELIVERY_KEY,
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        resetUrl: "https://app.ceird.localhost/reset?token=abc123",
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
          "https://app.ceird.localhost/reset?token=abc123",
        ].join("\n"),
        html: [
          "<p>Hello Alice,</p>",
          '<p><a href="https://app.ceird.localhost/reset?token=abc123">Reset your password</a></p>',
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
        resetUrl: "https://app.ceird.localhost/reset?token=abc123",
      }).pipe(
        effectEither,
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
      _tag: PASSWORD_RESET_EMAIL_REQUEST_ERROR_TAG,
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
          "https://user:password@app.ceird.localhost/reset?token=abc123",
      } as never).pipe(
        effectEither,
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
      _tag: INVALID_PASSWORD_RESET_EMAIL_INPUT_ERROR_TAG,
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
        resetUrl: "https://app.ceird.localhost/reset?token=abc123",
      } as never).pipe(
        effectEither,
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
      _tag: INVALID_PASSWORD_RESET_EMAIL_INPUT_ERROR_TAG,
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
        resetUrl: "https://app.ceird.localhost/reset?token=abc123",
      }).pipe(
        effectEither,
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
      _tag: PASSWORD_RESET_EMAIL_REJECTED_ERROR_TAG,
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
        resetUrl: "https://app.ceird.localhost/reset?token=abc&next=%2Fhome",
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
      '<p>Hello Alice &amp; &lt;Admin&gt; &quot;Boss&quot;,</p><p><a href="https://app.ceird.localhost/reset?token=abc&amp;next=%2Fhome">Reset your password</a></p>'
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
        deliveryKey: "email-verification/user-123/token-verify123",
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        verificationUrl: "https://app.ceird.localhost/verify-email?success=1",
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
        deliveryKey: "email-verification/user-123/token-verify123",
        to: "alice@example.com",
        subject: "Verify your email",
        text: [
          "Hello Alice,",
          "",
          "Use this link to verify your email:",
          "https://app.ceird.localhost/verify-email?success=1",
        ].join("\n"),
        html: [
          "<p>Hello Alice,</p>",
          '<p><a href="https://app.ceird.localhost/verify-email?success=1">Verify your email</a></p>',
        ].join(""),
      },
    ]);
  }, 10_000);

  it("rejects invalid verification input before sending", async () => {
    const sentMessages: TransportMessage[] = [];

    const result = await Effect.runPromise(
      AuthEmailSender.sendEmailVerificationEmail({
        deliveryKey: "email-verification/user-123/token-invalid",
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        verificationUrl:
          "https://user:password@app.ceird.localhost/verify-email?success=1",
      } as never).pipe(
        effectEither,
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
    expect(result.left).toBeInstanceOf(InvalidEmailVerificationEmailInputError);
    expect(result.left).toMatchObject({
      _tag: INVALID_EMAIL_VERIFICATION_EMAIL_INPUT_ERROR_TAG,
      message: "Invalid verification email input",
    });
  }, 10_000);

  it("maps provider request failures into EmailVerificationEmailRequestError", async () => {
    const result = await Effect.runPromise(
      AuthEmailSender.sendEmailVerificationEmail({
        deliveryKey: "email-verification/user-123/token-verify123",
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        verificationUrl: "https://app.ceird.localhost/verify-email?success=1",
      }).pipe(
        effectEither,
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

    expect(result.left).toBeInstanceOf(EmailVerificationEmailRequestError);
    expect(result.left).toMatchObject({
      _tag: EMAIL_VERIFICATION_EMAIL_REQUEST_ERROR_TAG,
      message: "Failed to deliver verification email",
      cause: "upstream timeout",
    });
  }, 10_000);

  it("maps provider rejections into EmailVerificationEmailRejectedError", async () => {
    const result = await Effect.runPromise(
      AuthEmailSender.sendEmailVerificationEmail({
        deliveryKey: "email-verification/user-123/token-rejected",
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        verificationUrl: "https://app.ceird.localhost/verify-email?success=1",
      }).pipe(
        effectEither,
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

    expect(result.left).toBeInstanceOf(EmailVerificationEmailRejectedError);
    expect(result.left).toMatchObject({
      _tag: EMAIL_VERIFICATION_EMAIL_REJECTED_ERROR_TAG,
      message: "Verification email was rejected for delivery",
      cause: "recipient address rejected",
    });
  }, 10_000);
});

describe("auth email config loading", () => {
  it("requires auth email config through Config", async () => {
    const result = await Effect.runPromise(
      loadAuthEmailConfig.pipe(
        withConfigProvider(
          configProviderFromMap(
            new Map([["AUTH_APP_ORIGIN", "https://app.ceird.localhost"]])
          )
        ),
        effectEither
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailConfigurationError);
    expect(result.left.cause).toMatch(/AUTH_EMAIL_FROM/);
  }, 10_000);

  it("loads base auth email config without Cloudflare credentials", async () => {
    const config = await Effect.runPromise(
      loadAuthEmailConfig.pipe(
        withConfigProvider(
          configProviderFromMap(
            new Map([
              ["AUTH_APP_ORIGIN", "https://app.ceird.localhost"],
              ["AUTH_EMAIL_FROM", "auth@ceird.localhost"],
            ])
          )
        )
      )
    );

    expect(config).toStrictEqual({
      appOrigin: "https://app.ceird.localhost",
      from: "auth@ceird.localhost",
      fromName: "Ceird",
    });
  }, 10_000);

  it("requires AUTH_APP_ORIGIN in auth email config", async () => {
    const result = await Effect.runPromise(
      loadAuthEmailConfig.pipe(
        withConfigProvider(
          configProviderFromMap(
            new Map([["AUTH_EMAIL_FROM", "auth@ceird.localhost"]])
          )
        ),
        effectEither
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailConfigurationError);
    expect(result.left.cause).toMatch(/AUTH_APP_ORIGIN/);
  }, 10_000);

  it("rejects invalid auth email sender addresses", async () => {
    const result = await Effect.runPromise(
      loadAuthEmailConfig.pipe(
        withConfigProvider(
          configProviderFromMap(
            new Map([
              ["AUTH_APP_ORIGIN", "https://app.ceird.localhost"],
              ["AUTH_EMAIL_FROM", "not-an-email"],
            ])
          )
        ),
        effectEither
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
