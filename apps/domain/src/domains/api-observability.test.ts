import { Cause, Effect, Exit, Logger, Option, References } from "effect";

import { observeApiOperation } from "./api-observability.js";

function captureLogs() {
  const logs: unknown[] = [];
  const logger = Logger.make((input) => {
    logs.push({
      annotations: input.fiber.getRef(References.CurrentLogAnnotations),
      level: input.logLevel.toUpperCase(),
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
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    expect(Exit.isFailure(exit)).toBeTruthy();
    const actualFailure = Exit.isFailure(exit)
      ? Option.getOrUndefined(Cause.findErrorOption(exit.cause))
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
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
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

  it("logs sanitized nested storage failure causes for Cloudflare search", async () => {
    const { logger, logs } = captureLogs();
    const postgresCause = {
      code: "22P02",
      detail: 'Expected ":", but found "}".',
      message: "invalid input syntax for type json",
      routine: "json_errsave_error",
    };
    const failure = {
      _tag: "SiteStorageError",
      cause:
        'SqlError: Failed to execute statement; Postgres 22P02: invalid input syntax for type json; detail: Expected ":", but found "}".; routine: json_errsave_error',
      message: "Sites storage operation failed",
      siteId: "11111111-1111-4111-8111-111111111111",
      postgresCause,
    };

    await Effect.fail(failure).pipe(
      observeApiOperation({
        domain: "sites",
        operation: "createSite",
        service: "SitesService",
      }),
      Effect.exit,
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    expect(logs).toStrictEqual([
      {
        annotations: {
          apiDomain: "sites",
          apiFailureCause:
            'SqlError: Failed to execute statement; Postgres 22P02: invalid input syntax for type json; detail: Expected ":", but found "}".; routine: json_errsave_error',
          apiFailureDetails: {
            siteId: "11111111-1111-4111-8111-111111111111",
          },
          apiFailureMessage: "Sites storage operation failed",
          apiFailureTag: "SiteStorageError",
          apiOperation: "createSite",
          apiService: "SitesService",
        },
        level: "WARN",
        message: ["API domain operation failed"],
      },
    ]);
  });
});
