import { Schema } from "effect";

import {
  ACCOUNT_PASSWORD_LENGTH_MESSAGE,
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MIN_LENGTH,
} from "./auth-schemas";

export function getErrorText(
  errors: readonly unknown[] | undefined
): string | undefined {
  if (!errors) {
    return undefined;
  }

  for (const error of errors) {
    if (typeof error === "string" && error.length > 0) {
      return normalizeValidationMessage(error);
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message.length > 0
    ) {
      return normalizeValidationMessage(error.message);
    }
  }

  return undefined;
}

function normalizeValidationMessage(message: string): string {
  const normalized = message.toLowerCase();
  const minimumPasswordLength = ACCOUNT_PASSWORD_MIN_LENGTH.toString();
  const maximumPasswordLength = ACCOUNT_PASSWORD_MAX_LENGTH.toString();
  const lengthAtLeastOnePattern = /length of at least 1(?!\d)/;

  if (
    normalized.includes("expected a non empty string") ||
    normalized.includes("non-empty string") ||
    normalized.includes("non empty string") ||
    lengthAtLeastOnePattern.test(normalized)
  ) {
    return "This field is required.";
  }

  if (
    normalized.includes("email") &&
    (normalized.includes("valid") || normalized.includes("format"))
  ) {
    return "Enter a valid email address.";
  }

  if (
    normalized.includes("matching the pattern") &&
    message.includes("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")
  ) {
    return "Enter a valid email address.";
  }

  if (
    normalized.includes(ACCOUNT_PASSWORD_LENGTH_MESSAGE.toLowerCase()) ||
    normalized.includes(`at least ${minimumPasswordLength}`) ||
    normalized.includes(`minimum of ${minimumPasswordLength}`) ||
    normalized.includes(`min ${minimumPasswordLength}`) ||
    normalized.includes(`at most ${maximumPasswordLength}`) ||
    normalized.includes(`maximum of ${maximumPasswordLength}`) ||
    normalized.includes(`max ${maximumPasswordLength}`)
  ) {
    return ACCOUNT_PASSWORD_LENGTH_MESSAGE;
  }

  if (
    normalized.includes("at least 2") ||
    normalized.includes("minimum of 2")
  ) {
    return "Use at least 2 characters.";
  }

  return message;
}

type AuthFailureAction = "signIn" | "signUp";
type SettingsFailureAction = "email" | "password" | "profile";
const COMPROMISED_PASSWORD_MESSAGE =
  "Choose a different password; this one appears in known data breaches.";
const CAPTCHA_FAILURE_MESSAGE = "Complete the security check and try again.";
const RATE_LIMIT_UNAVAILABLE_MESSAGE =
  "We couldn't verify this request right now. Please try again in a moment.";
const COMPROMISED_PASSWORD_NEEDLES = [
  "PASSWORD_COMPROMISED",
  "compromised",
] as const;
const CAPTCHA_FAILURE_NEEDLES = ["CAPTCHA", "Captcha", "captcha"] as const;
const RATE_LIMIT_UNAVAILABLE_NEEDLES = [
  "AUTH_RATE_LIMIT_UNAVAILABLE",
  "Authentication protection is temporarily unavailable",
] as const;
const PASSWORD_RESET_INVALID_TOKEN_NEEDLES = [
  "INVALID_TOKEN",
  "invalid token",
  "invalid or expired",
  "token expired",
  "expired token",
] as const;
const AuthFailureError = Schema.Struct({
  code: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Number),
  statusText: Schema.optional(Schema.String),
});
const isAuthFailureError = Schema.is(AuthFailureError);

export function getAuthFailureMessage(
  action: AuthFailureAction,
  error: unknown
): string {
  const authFailureError = isAuthFailureError(error) ? error : undefined;

  if (isRateLimitUnavailableFailure(authFailureError)) {
    return RATE_LIMIT_UNAVAILABLE_MESSAGE;
  }

  if (authFailureError?.status === 429) {
    return "Too many attempts. Please wait and try again.";
  }

  if (isCaptchaFailure(authFailureError)) {
    return CAPTCHA_FAILURE_MESSAGE;
  }

  if (action === "signUp" && isCompromisedPasswordFailure(authFailureError)) {
    return COMPROMISED_PASSWORD_MESSAGE;
  }

  if (action === "signIn") {
    return "We couldn't sign you in. Check your email and password and try again.";
  }

  return "We couldn't create your account. Please try again.";
}

function getRateLimitedFailureMessage(
  error: unknown,
  fallbackMessage: string
): string {
  const authFailureError = isAuthFailureError(error) ? error : undefined;

  if (isRateLimitUnavailableFailure(authFailureError)) {
    return RATE_LIMIT_UNAVAILABLE_MESSAGE;
  }

  if (authFailureError?.status === 429) {
    return "Too many attempts. Please wait and try again.";
  }

  if (isCaptchaFailure(authFailureError)) {
    return CAPTCHA_FAILURE_MESSAGE;
  }

  return fallbackMessage;
}

function getPasswordMutationFailureMessage(
  error: unknown,
  fallbackMessage: string
): string {
  const authFailureError = isAuthFailureError(error) ? error : undefined;

  if (isRateLimitUnavailableFailure(authFailureError)) {
    return RATE_LIMIT_UNAVAILABLE_MESSAGE;
  }

  if (authFailureError?.status === 429) {
    return "Too many attempts. Please wait and try again.";
  }

  if (isCompromisedPasswordFailure(authFailureError)) {
    return COMPROMISED_PASSWORD_MESSAGE;
  }

  return fallbackMessage;
}

export function getPasswordResetRequestFailureMessage(error: unknown): string {
  return getRateLimitedFailureMessage(
    error,
    "We couldn't send a password reset link. Please try again."
  );
}

export function getEmailVerificationFailureMessage(error: unknown): string {
  return getRateLimitedFailureMessage(
    error,
    "We couldn't send a verification email. Please try again."
  );
}

export function getPasswordResetFailureMessage(error: unknown): string {
  return getPasswordMutationFailureMessage(
    error,
    "We couldn't reset your password. Please try again."
  );
}

export function getSettingsFailureMessage(
  action: SettingsFailureAction,
  error: unknown
): string {
  let fallbackMessage: string;

  if (action === "profile") {
    fallbackMessage = "We couldn't update your profile. Please try again.";
  } else if (action === "email") {
    fallbackMessage = "We couldn't send that email change. Please try again.";
  } else {
    fallbackMessage =
      "We couldn't update your password. Check your current password and try again.";
  }

  return action === "password"
    ? getPasswordMutationFailureMessage(error, fallbackMessage)
    : getRateLimitedFailureMessage(error, fallbackMessage);
}

function isCompromisedPasswordFailure(
  error: Schema.Schema.Type<typeof AuthFailureError> | undefined
) {
  if (!error) {
    return false;
  }

  return [error.code, error.message, error.statusText].some((field) => {
    if (typeof field !== "string") {
      return false;
    }

    return COMPROMISED_PASSWORD_NEEDLES.some((needle) =>
      field.toLowerCase().includes(needle.toLowerCase())
    );
  });
}

function isCaptchaFailure(
  error: Schema.Schema.Type<typeof AuthFailureError> | undefined
) {
  if (!error) {
    return false;
  }

  return [error.code, error.message, error.statusText].some((field) => {
    if (typeof field !== "string") {
      return false;
    }

    return CAPTCHA_FAILURE_NEEDLES.some((needle) => field.includes(needle));
  });
}

function isRateLimitUnavailableFailure(
  error: Schema.Schema.Type<typeof AuthFailureError> | undefined
) {
  if (!error) {
    return false;
  }

  return [error.code, error.message, error.statusText].some((field) => {
    if (typeof field !== "string") {
      return false;
    }

    return RATE_LIMIT_UNAVAILABLE_NEEDLES.some((needle) =>
      field.toLowerCase().includes(needle.toLowerCase())
    );
  });
}

export function isInvalidPasswordResetTokenError(error: unknown): boolean {
  const authFailureError = isAuthFailureError(error) ? error : undefined;

  if (authFailureError?.status !== 400 && authFailureError?.status !== 401) {
    return false;
  }

  if (
    isCompromisedPasswordFailure(authFailureError) ||
    isCaptchaFailure(authFailureError)
  ) {
    return false;
  }

  return [
    authFailureError.code,
    authFailureError.message,
    authFailureError.statusText,
  ].some((field) => {
    if (typeof field !== "string") {
      return false;
    }

    return PASSWORD_RESET_INVALID_TOKEN_NEEDLES.some((needle) =>
      field.toLowerCase().includes(needle.toLowerCase())
    );
  });
}

export function getFormErrorText(error: unknown): string | undefined {
  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  if (Array.isArray(error)) {
    return getErrorText(error);
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "form" in error &&
    typeof error.form === "string" &&
    error.form.length > 0
  ) {
    return error.form;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "form" in error &&
    typeof error.form === "object" &&
    error.form !== null
  ) {
    const rootErrors = "" in error.form ? error.form[""] : undefined;
    return getErrorText(Array.isArray(rootErrors) ? rootErrors : undefined);
  }

  if (typeof error === "object" && error !== null) {
    const rootErrors = "" in error ? error[""] : undefined;
    return getErrorText(Array.isArray(rootErrors) ? rootErrors : undefined);
  }

  return undefined;
}
