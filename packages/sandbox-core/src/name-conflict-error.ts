import { Schema } from "effect";

import { SandboxName } from "./naming.js";

export const SANDBOX_NAME_CONFLICT_ERROR_TAG =
  "@ceird/sandbox-core/SandboxNameConflictError" as const;

export class SandboxNameConflictError extends Schema.TaggedError<SandboxNameConflictError>()(
  SANDBOX_NAME_CONFLICT_ERROR_TAG,
  {
    message: Schema.String,
    sandboxName: SandboxName,
  }
) {}
