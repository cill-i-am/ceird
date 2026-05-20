import { Schema } from "effect";

export class AppDatabaseConnectionError extends Schema.TaggedErrorClass<AppDatabaseConnectionError>()(
  "@ceird/platform/database/AppDatabaseConnectionError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}
