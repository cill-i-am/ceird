import { Cause, Effect, Option } from "effect";

const FAILURE_DETAIL_KEYS = [
  "collaboratorId",
  "labelId",
  "organizationId",
  "rateCardId",
  "serviceAreaId",
  "siteId",
  "workItemId",
] as const;

interface ApiOperationObservabilityOptions {
  readonly domain: string;
  readonly operation: string;
  readonly service: string;
}

export function observeApiOperation(options: ApiOperationObservabilityOptions) {
  const spanName = `api.${options.domain}.${options.operation}`;

  return <Success, Error, Requirements>(
    effect: Effect.Effect<Success, Error, Requirements>
  ) =>
    effect.pipe(
      Effect.tapErrorCause((cause) => logApiOperationFailure(options, cause)),
      Effect.withSpan(spanName, {
        attributes: {
          apiDomain: options.domain,
          apiOperation: options.operation,
          apiService: options.service,
        },
        captureStackTrace: false,
      }),
      Effect.withLogSpan(spanName)
    );
}

function logApiOperationFailure(
  options: ApiOperationObservabilityOptions,
  cause: Cause.Cause<unknown>
) {
  const failure = Cause.failureOption(cause);
  const serializedFailure = Option.isSome(failure)
    ? serializeFailure(failure.value)
    : {
        cause: undefined,
        details: undefined,
        message: String(Cause.squash(cause)),
        tag: "Defect",
      };

  const log = shouldWarnForApiFailure(serializedFailure.tag)
    ? Effect.logWarning("API domain operation failed")
    : Effect.logInfo("API domain operation failed");

  return log.pipe(
    Effect.annotateLogs({
      apiDomain: options.domain,
      ...(serializedFailure.cause
        ? { apiFailureCause: serializedFailure.cause }
        : {}),
      ...(serializedFailure.details
        ? { apiFailureDetails: serializedFailure.details }
        : {}),
      apiFailureMessage: serializedFailure.message,
      apiFailureTag: serializedFailure.tag,
      apiOperation: options.operation,
      apiService: options.service,
    })
  );
}

function shouldWarnForApiFailure(tag: string) {
  return tag === "Defect" || tag.endsWith("StorageError");
}

function serializeFailure(error: unknown) {
  if (typeof error === "object" && error !== null) {
    return {
      cause:
        "cause" in error && typeof error.cause === "string"
          ? error.cause
          : undefined,
      details: serializeFailureDetails(error),
      message:
        "message" in error && typeof error.message === "string"
          ? error.message
          : String(error),
      tag: "_tag" in error && typeof error._tag === "string" ? error._tag : "",
    };
  }

  return {
    cause: undefined,
    details: undefined,
    message: String(error),
    tag: typeof error,
  };
}

function serializeFailureDetails(error: object) {
  const source = error as Record<string, unknown>;
  const details: Record<string, string> = Object.fromEntries(
    FAILURE_DETAIL_KEYS.flatMap((key) => {
      if (!(key in source)) {
        return [];
      }

      const value = source[key];
      return typeof value === "string" ? [[key, value]] : [];
    })
  );

  return Object.keys(details).length > 0 ? details : undefined;
}
