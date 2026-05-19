import { Cause, Effect, Exit, HashMap, LogLevel, Logger, Option } from "effect";

import { observeApiOperation } from "./api-observability.js";

function captureLogs() {
  const logs: unknown[] = [];
  const logger = Logger.make((input) => {
    logs.push({
      annotations: Object.fromEntries(HashMap.toEntries(input.annotations)),
      level: input.logLevel.label,
      message: input.message,
    });
  });

  return { logger, logs };
}

describe("API operation observability", () => {
  it("logs structured operation failures without changing the failure", async () => {
    const { logger, logs } = captureLogs();
    const failure = {
      _tag: "ExampleStorageError",
      cause: "database unavailable",
      message: "Example storage failed",
      workItemId: "11111111-1111-4111-8111-111111111111",
    };

    const exit = await Effect.fail(failure).pipe(
      observeApiOperation({
        domain: "jobs",
        operation: "createJob",
        service: "JobsService",
      }),
      Effect.exit,
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      Logger.withMinimumLogLevel(LogLevel.Trace),
      Effect.runPromise
    );

    expect(Exit.isFailure(exit)).toBeTruthy();
    const actualFailure = Exit.isFailure(exit)
      ? Option.getOrUndefined(Cause.failureOption(exit.cause))
      : undefined;
    expect(actualFailure).toStrictEqual(failure);
    expect(logs).toStrictEqual([
      {
        annotations: {
          apiDomain: "jobs",
          apiFailureCause: "database unavailable",
          apiFailureDetails: {
            workItemId: "11111111-1111-4111-8111-111111111111",
          },
          apiFailureMessage: "Example storage failed",
          apiFailureTag: "ExampleStorageError",
          apiOperation: "createJob",
          apiService: "JobsService",
        },
        level: "WARN",
        message: ["API domain operation failed"],
      },
    ]);
  });

  it("logs expected typed domain failures at info level", async () => {
    const { logger, logs } = captureLogs();
    const failure = {
      _tag: "@ceird/jobs-core/JobNotFoundError",
      message: "Job not found",
      workItemId: "11111111-1111-4111-8111-111111111111",
    };

    const exit = await Effect.fail(failure).pipe(
      observeApiOperation({
        domain: "jobs",
        operation: "getJobDetail",
        service: "JobsService",
      }),
      Effect.exit,
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      Logger.withMinimumLogLevel(LogLevel.Trace),
      Effect.runPromise
    );

    expect(Exit.isFailure(exit)).toBeTruthy();
    expect(logs).toStrictEqual([
      {
        annotations: {
          apiDomain: "jobs",
          apiFailureDetails: {
            workItemId: "11111111-1111-4111-8111-111111111111",
          },
          apiFailureMessage: "Job not found",
          apiFailureTag: "@ceird/jobs-core/JobNotFoundError",
          apiOperation: "getJobDetail",
          apiService: "JobsService",
        },
        level: "INFO",
        message: ["API domain operation failed"],
      },
    ]);
  });
});
