import {
  getEmailVerificationFailureMessage,
  getErrorText,
  getAuthFailureMessage,
  getSettingsFailureMessage,
  isInvalidPasswordResetTokenError,
  getPasswordResetFailureMessage,
  getPasswordResetRequestFailureMessage,
} from "./auth-form-errors";

describe("password reset form errors", () => {
  it("preserves the shared rate-limit copy for password reset requests", () => {
    expect(getPasswordResetRequestFailureMessage({ status: 429 })).toBe(
      "Too many attempts. Please wait and try again."
    );
  }, 1000);

  it("preserves the shared rate-limit copy for password resets", () => {
    expect(getPasswordResetFailureMessage({ status: 429 })).toBe(
      "Too many attempts. Please wait and try again."
    );
  }, 1000);

  it("preserves the shared rate-limit copy for verification email requests", () => {
    expect(getEmailVerificationFailureMessage({ status: 429 })).toBe(
      "Too many attempts. Please wait and try again."
    );
  }, 1000);

  it("preserves the shared rate-limit copy for settings saves", () => {
    expect(getSettingsFailureMessage("profile", { status: 429 })).toBe(
      "Too many attempts. Please wait and try again."
    );
  }, 1000);

  it("maps unavailable auth protection during sign-in and sign-up", () => {
    const error = {
      code: "AUTH_RATE_LIMIT_UNAVAILABLE",
      status: 503,
    };

    expect(getAuthFailureMessage("signIn", error)).toBe(
      "We couldn't verify this request right now. Please try again in a moment."
    );
    expect(getAuthFailureMessage("signUp", error)).toBe(
      "We couldn't verify this request right now. Please try again in a moment."
    );
  }, 1000);

  it("maps unavailable auth protection during delivery requests", () => {
    expect(
      getPasswordResetRequestFailureMessage({
        message: "Authentication protection is temporarily unavailable.",
        status: 503,
      })
    ).toBe(
      "We couldn't verify this request right now. Please try again in a moment."
    );
    expect(
      getEmailVerificationFailureMessage({
        code: "AUTH_RATE_LIMIT_UNAVAILABLE",
        status: 503,
      })
    ).toBe(
      "We couldn't verify this request right now. Please try again in a moment."
    );
  }, 1000);

  it("maps compromised password failures during sign-up", () => {
    expect(
      getAuthFailureMessage("signUp", {
        code: "PASSWORD_COMPROMISED",
        status: 400,
      })
    ).toBe(
      "Choose a different password; this one appears in known data breaches."
    );
  }, 1000);

  it("maps compromised password failures during password reset", () => {
    expect(
      getPasswordResetFailureMessage({
        message:
          "The password you entered has been compromised. Please choose a different password.",
        status: 400,
      })
    ).toBe(
      "Choose a different password; this one appears in known data breaches."
    );
  }, 1000);

  it("maps compromised password failures during password changes", () => {
    expect(
      getSettingsFailureMessage("password", {
        code: "PASSWORD_COMPROMISED",
        status: 400,
      })
    ).toBe(
      "Choose a different password; this one appears in known data breaches."
    );
  }, 1000);

  it("maps captcha failures during sign-up", () => {
    expect(
      getAuthFailureMessage("signUp", {
        code: "VERIFICATION_FAILED",
        message: "Captcha verification failed",
        status: 403,
      })
    ).toBe("Complete the security check and try again.");
  }, 1000);

  it("maps missing captcha responses during email delivery requests", () => {
    expect(
      getEmailVerificationFailureMessage({
        code: "MISSING_RESPONSE",
        message: "Missing CAPTCHA response",
        status: 400,
      })
    ).toBe("Complete the security check and try again.");
  }, 1000);

  it("treats only token-shaped 400 and 401 reset failures as invalid-token states", () => {
    expect([
      isInvalidPasswordResetTokenError({
        code: "INVALID_TOKEN",
        status: 400,
      }),
      isInvalidPasswordResetTokenError({
        message: "invalid token",
        status: 401,
      }),
      isInvalidPasswordResetTokenError({
        code: "PASSWORD_COMPROMISED",
        status: 400,
      }),
      isInvalidPasswordResetTokenError({
        message: "bad request",
        status: 400,
      }),
      isInvalidPasswordResetTokenError({ status: 429 }),
    ]).toStrictEqual([true, true, false, false, false]);
  }, 1000);

  it("normalizes raw email pattern validation messages", () => {
    expect(
      getErrorText([
        'Expected a string matching the pattern ^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$, actual "not-an-email"',
      ])
    ).toBe("Enter a valid email address.");
  }, 1000);

  it("does not treat password minimum-length messages as required-field errors", () => {
    expect(
      getErrorText([
        'Expected a value with a length of at least 12, got "short"',
      ])
    ).toBe("Use 12 to 256 characters.");
  }, 1000);
});
