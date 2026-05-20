/* oxlint-disable eslint/max-classes-per-file */

import { Schema } from "effect";

export const AUTH_EMAIL_CONFIGURATION_ERROR_TAG =
  "@ceird/domains/identity/authentication/AuthEmailConfigurationError" as const;
export class AuthEmailConfigurationError extends Schema.TaggedErrorClass<AuthEmailConfigurationError>()(
  AUTH_EMAIL_CONFIGURATION_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export const AUTH_EMAIL_REQUEST_ERROR_TAG =
  "@ceird/domains/identity/authentication/AuthEmailRequestError" as const;
export class AuthEmailRequestError extends Schema.TaggedErrorClass<AuthEmailRequestError>()(
  AUTH_EMAIL_REQUEST_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export const AUTH_EMAIL_REJECTED_ERROR_TAG =
  "@ceird/domains/identity/authentication/AuthEmailRejectedError" as const;
export class AuthEmailRejectedError extends Schema.TaggedErrorClass<AuthEmailRejectedError>()(
  AUTH_EMAIL_REJECTED_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export const INVALID_PASSWORD_RESET_EMAIL_INPUT_ERROR_TAG =
  "@ceird/domains/identity/authentication/InvalidPasswordResetEmailInputError" as const;
export class InvalidPasswordResetEmailInputError extends Schema.TaggedErrorClass<InvalidPasswordResetEmailInputError>()(
  INVALID_PASSWORD_RESET_EMAIL_INPUT_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export const PASSWORD_RESET_EMAIL_REJECTED_ERROR_TAG =
  "@ceird/domains/identity/authentication/PasswordResetEmailRejectedError" as const;
export class PasswordResetEmailRejectedError extends Schema.TaggedErrorClass<PasswordResetEmailRejectedError>()(
  PASSWORD_RESET_EMAIL_REJECTED_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export const PASSWORD_RESET_EMAIL_REQUEST_ERROR_TAG =
  "@ceird/domains/identity/authentication/PasswordResetEmailRequestError" as const;
export class PasswordResetEmailRequestError extends Schema.TaggedErrorClass<PasswordResetEmailRequestError>()(
  PASSWORD_RESET_EMAIL_REQUEST_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export const INVALID_ORGANIZATION_INVITATION_EMAIL_INPUT_ERROR_TAG =
  "@ceird/domains/identity/authentication/InvalidOrganizationInvitationEmailInputError" as const;
export class InvalidOrganizationInvitationEmailInputError extends Schema.TaggedErrorClass<InvalidOrganizationInvitationEmailInputError>()(
  INVALID_ORGANIZATION_INVITATION_EMAIL_INPUT_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export const ORGANIZATION_INVITATION_EMAIL_REJECTED_ERROR_TAG =
  "@ceird/domains/identity/authentication/OrganizationInvitationEmailRejectedError" as const;
export class OrganizationInvitationEmailRejectedError extends Schema.TaggedErrorClass<OrganizationInvitationEmailRejectedError>()(
  ORGANIZATION_INVITATION_EMAIL_REJECTED_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export const ORGANIZATION_INVITATION_EMAIL_REQUEST_ERROR_TAG =
  "@ceird/domains/identity/authentication/OrganizationInvitationEmailRequestError" as const;
export class OrganizationInvitationEmailRequestError extends Schema.TaggedErrorClass<OrganizationInvitationEmailRequestError>()(
  ORGANIZATION_INVITATION_EMAIL_REQUEST_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export const INVALID_EMAIL_VERIFICATION_EMAIL_INPUT_ERROR_TAG =
  "@ceird/domains/identity/authentication/InvalidEmailVerificationEmailInputError" as const;
export class InvalidEmailVerificationEmailInputError extends Schema.TaggedErrorClass<InvalidEmailVerificationEmailInputError>()(
  INVALID_EMAIL_VERIFICATION_EMAIL_INPUT_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export const EMAIL_VERIFICATION_EMAIL_REJECTED_ERROR_TAG =
  "@ceird/domains/identity/authentication/EmailVerificationEmailRejectedError" as const;
export class EmailVerificationEmailRejectedError extends Schema.TaggedErrorClass<EmailVerificationEmailRejectedError>()(
  EMAIL_VERIFICATION_EMAIL_REJECTED_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export const EMAIL_VERIFICATION_EMAIL_REQUEST_ERROR_TAG =
  "@ceird/domains/identity/authentication/EmailVerificationEmailRequestError" as const;
export class EmailVerificationEmailRequestError extends Schema.TaggedErrorClass<EmailVerificationEmailRequestError>()(
  EMAIL_VERIFICATION_EMAIL_REQUEST_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}
