import { Schema } from "effect";

export class AppDatabaseConnectionError extends Schema.TaggedError<AppDatabaseConnectionError>()(
  "@task-tracker/platform/database/AppDatabaseConnectionError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}
