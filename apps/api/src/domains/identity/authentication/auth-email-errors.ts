/* oxlint-disable eslint/max-classes-per-file */

import { Schema } from "effect";

export class AuthEmailConfigurationError extends Schema.TaggedError<AuthEmailConfigurationError>()(
  "AuthEmailConfigurationError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class AuthEmailDeliveryError extends Schema.TaggedError<AuthEmailDeliveryError>()(
  "AuthEmailDeliveryError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class PasswordResetDeliveryError extends Schema.TaggedError<PasswordResetDeliveryError>()(
  "PasswordResetDeliveryError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}
