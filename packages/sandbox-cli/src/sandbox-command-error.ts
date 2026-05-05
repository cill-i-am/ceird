import { Schema } from "effect";

export const SANDBOX_COMMAND_ERROR_TAG =
  "@ceird/sandbox-cli/SandboxCommandError" as const;

export class SandboxCommandError extends Schema.TaggedError<SandboxCommandError>()(
  SANDBOX_COMMAND_ERROR_TAG,
  {
    command: Schema.Array(Schema.String),
    message: Schema.String,
    stderr: Schema.optional(Schema.String),
    exitCode: Schema.optional(Schema.Number),
  }
) {}
