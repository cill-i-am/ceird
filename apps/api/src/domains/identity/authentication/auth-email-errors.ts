/* oxlint-disable eslint/max-classes-per-file */

import { Schema } from "effect";

export class AuthEmailConfigurationError extends Schema.TaggedError<AuthEmailConfigurationError>()(
  "AuthEmailConfigurationError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class AuthEmailRequestError extends Schema.TaggedError<AuthEmailRequestError>()(
  "AuthEmailRequestError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class AuthEmailRejectedError extends Schema.TaggedError<AuthEmailRejectedError>()(
  "AuthEmailRejectedError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class InvalidPasswordResetEmailInputError extends Schema.TaggedError<InvalidPasswordResetEmailInputError>()(
  "InvalidPasswordResetEmailInputError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class PasswordResetEmailRejectedError extends Schema.TaggedError<PasswordResetEmailRejectedError>()(
  "PasswordResetEmailRejectedError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class PasswordResetEmailRequestError extends Schema.TaggedError<PasswordResetEmailRequestError>()(
  "PasswordResetEmailRequestError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}
