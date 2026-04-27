import {
  getEmailVerificationFailureMessage,
  getErrorText,
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

  it("treats 400 and 401 reset failures as invalid-token states", () => {
    expect([
      isInvalidPasswordResetTokenError({ status: 400 }),
      isInvalidPasswordResetTokenError({ status: 401 }),
      isInvalidPasswordResetTokenError({ status: 429 }),
    ]).toStrictEqual([true, true, false]);
  }, 1000);

  it("normalizes raw email pattern validation messages", () => {
    expect(
      getErrorText([
        'Expected a string matching the pattern ^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$, actual "not-an-email"',
      ])
    ).toBe("Enter a valid email address.");
  }, 1000);
});
