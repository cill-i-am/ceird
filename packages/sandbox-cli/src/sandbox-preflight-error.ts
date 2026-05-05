import { Schema } from "effect";

export const SANDBOX_PREFLIGHT_ERROR_TAG =
  "@ceird/sandbox-cli/SandboxPreflightError" as const;

const SandboxPreflightErrorContext = {
  causeTag: Schema.optional(Schema.String),
  sandboxName: Schema.optional(Schema.String),
  missing: Schema.optional(Schema.Array(Schema.String)),
  filePath: Schema.optional(Schema.String),
  registryPath: Schema.optional(Schema.String),
  command: Schema.optional(Schema.Array(Schema.String)),
  stderr: Schema.optional(Schema.String),
  exitCode: Schema.optional(Schema.Number),
};

export class SandboxPreflightError extends Schema.TaggedError<SandboxPreflightError>()(
  SANDBOX_PREFLIGHT_ERROR_TAG,
  {
    message: Schema.String,
    ...SandboxPreflightErrorContext,
  }
) {}

export function toSandboxPreflightError(
  error: unknown,
  options: {
    readonly message?: string;
    readonly preserveMessage?: boolean;
  } = {}
): SandboxPreflightError {
  if (error instanceof SandboxPreflightError) {
    return error;
  }

  const inheritedMessage = error instanceof Error ? error.message : undefined;
  let message =
    options.message ?? inheritedMessage ?? "Sandbox preflight failed.";

  if (options.preserveMessage) {
    message =
      inheritedMessage ?? options.message ?? "Sandbox preflight failed.";
  } else if (inheritedMessage && options.message) {
    message = `${options.message}: ${inheritedMessage}`;
  }

  return new SandboxPreflightError({
    message,
    ...extractSandboxPreflightContext(error),
  });
}

function extractSandboxPreflightContext(error: unknown): Partial<{
  readonly causeTag: string;
  readonly sandboxName: string;
  readonly missing: readonly string[];
  readonly filePath: string;
  readonly registryPath: string;
  readonly command: readonly string[];
  readonly stderr: string;
  readonly exitCode: number;
}> {
  if (typeof error !== "object" || error === null) {
    return {};
  }

  const context = error as {
    readonly _tag?: unknown;
    readonly sandboxName?: unknown;
    readonly missing?: unknown;
    readonly filePath?: unknown;
    readonly registryPath?: unknown;
    readonly command?: unknown;
    readonly stderr?: unknown;
    readonly exitCode?: unknown;
  };

  return {
    ...(typeof context._tag === "string" ? { causeTag: context._tag } : {}),
    ...(typeof context.sandboxName === "string"
      ? { sandboxName: context.sandboxName }
      : {}),
    ...(Array.isArray(context.missing) &&
    context.missing.every((value) => typeof value === "string")
      ? { missing: context.missing }
      : {}),
    ...(typeof context.filePath === "string"
      ? { filePath: context.filePath }
      : {}),
    ...(typeof context.registryPath === "string"
      ? { registryPath: context.registryPath }
      : {}),
    ...(Array.isArray(context.command) &&
    context.command.every((value) => typeof value === "string")
      ? { command: context.command }
      : {}),
    ...(typeof context.stderr === "string" ? { stderr: context.stderr } : {}),
    ...(typeof context.exitCode === "number"
      ? { exitCode: context.exitCode }
      : {}),
  };
}
