/* oxlint-disable eslint/max-classes-per-file */

import { Schema } from "effect";

export class AuthEmailConfigurationError extends Schema.TaggedErrorClass<AuthEmailConfigurationError>()(
  "AuthEmailConfigurationError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class AuthEmailRequestError extends Schema.TaggedErrorClass<AuthEmailRequestError>()(
  "AuthEmailRequestError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class AuthEmailRejectedError extends Schema.TaggedErrorClass<AuthEmailRejectedError>()(
  "AuthEmailRejectedError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class InvalidPasswordResetEmailInputError extends Schema.TaggedErrorClass<InvalidPasswordResetEmailInputError>()(
  "InvalidPasswordResetEmailInputError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class PasswordResetEmailRejectedError extends Schema.TaggedErrorClass<PasswordResetEmailRejectedError>()(
  "PasswordResetEmailRejectedError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class PasswordResetEmailRequestError extends Schema.TaggedErrorClass<PasswordResetEmailRequestError>()(
  "PasswordResetEmailRequestError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class InvalidOrganizationInvitationEmailInputError extends Schema.TaggedErrorClass<InvalidOrganizationInvitationEmailInputError>()(
  "InvalidOrganizationInvitationEmailInputError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class OrganizationInvitationEmailRejectedError extends Schema.TaggedErrorClass<OrganizationInvitationEmailRejectedError>()(
  "OrganizationInvitationEmailRejectedError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class OrganizationInvitationEmailRequestError extends Schema.TaggedErrorClass<OrganizationInvitationEmailRequestError>()(
  "OrganizationInvitationEmailRequestError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class InvalidEmailVerificationEmailInputError extends Schema.TaggedErrorClass<InvalidEmailVerificationEmailInputError>()(
  "InvalidEmailVerificationEmailInputError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class EmailVerificationEmailRejectedError extends Schema.TaggedErrorClass<EmailVerificationEmailRejectedError>()(
  "EmailVerificationEmailRejectedError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class EmailVerificationEmailRequestError extends Schema.TaggedErrorClass<EmailVerificationEmailRequestError>()(
  "EmailVerificationEmailRequestError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}
