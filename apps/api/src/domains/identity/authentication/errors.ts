import { Schema } from "effect";

export class AuthenticationDatabaseConnectionError extends Schema.TaggedError<AuthenticationDatabaseConnectionError>()(
  "@task-tracker/domains/identity/authentication/AuthenticationDatabaseConnectionError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}
