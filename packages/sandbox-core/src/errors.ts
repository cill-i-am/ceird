import { Schema } from "effect";

export const SANDBOX_NAME_ERROR_TAG =
  "@ceird/sandbox-core/SandboxNameError" as const;

export class SandboxNameError extends Schema.TaggedError<SandboxNameError>()(
  SANDBOX_NAME_ERROR_TAG,
  {
    message: Schema.String,
    sandboxName: Schema.String,
  }
) {}
