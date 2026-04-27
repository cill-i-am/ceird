import { Schema } from "effect";

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

  if (
    normalized.includes("expected a non empty string") ||
    normalized.includes("non-empty string") ||
    normalized.includes("non empty string")
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
    normalized.includes("at least 8") ||
    normalized.includes("minimum of 8")
  ) {
    return "Use at least 8 characters.";
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
const AuthFailureError = Schema.Struct({
  status: Schema.optional(Schema.Number),
});
const isAuthFailureError = Schema.is(AuthFailureError);

export function getAuthFailureMessage(
  action: AuthFailureAction,
  error: unknown
): string {
  const authFailureError = isAuthFailureError(error) ? error : undefined;

  if (authFailureError?.status === 429) {
    return "Too many attempts. Please wait and try again.";
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

  if (authFailureError?.status === 429) {
    return "Too many attempts. Please wait and try again.";
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
  return getRateLimitedFailureMessage(
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

  return getRateLimitedFailureMessage(error, fallbackMessage);
}

export function isInvalidPasswordResetTokenError(error: unknown): boolean {
  const authFailureError = isAuthFailureError(error) ? error : undefined;

  return authFailureError?.status === 400 || authFailureError?.status === 401;
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
