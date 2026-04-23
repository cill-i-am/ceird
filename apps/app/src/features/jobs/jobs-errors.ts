/* oxlint-disable eslint/max-classes-per-file */
import { HttpClientError } from "@effect/platform";
import type { JobsError } from "@task-tracker/jobs-core";
import { ParseResult, Schema } from "effect";

const JOBS_DOMAIN_ERROR_TAG_PREFIX = "@task-tracker/jobs-core/";

export const JOBS_API_ORIGIN_RESOLUTION_ERROR_TAG =
  "@task-tracker/app/jobs/JobsApiOriginResolutionError" as const;
export class JobsApiOriginResolutionError extends Schema.TaggedError<JobsApiOriginResolutionError>()(
  JOBS_API_ORIGIN_RESOLUTION_ERROR_TAG,
  {
    message: Schema.String,
  }
) {}

export const JOBS_REQUEST_ERROR_TAG =
  "@task-tracker/app/jobs/JobsRequestError" as const;
export class JobsRequestError extends Schema.TaggedError<JobsRequestError>()(
  JOBS_REQUEST_ERROR_TAG,
  {
    message: Schema.String,
  }
) {}

export type AppJobsError =
  | JobsError
  | JobsApiOriginResolutionError
  | JobsRequestError;

export function isJobsDomainError(error: unknown): error is JobsError {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    typeof error._tag === "string" &&
    error._tag.startsWith(JOBS_DOMAIN_ERROR_TAG_PREFIX) &&
    "message" in error &&
    typeof error.message === "string"
  );
}

export function normalizeJobsError(error: unknown): AppJobsError {
  if (
    error instanceof JobsApiOriginResolutionError ||
    error instanceof JobsRequestError ||
    isJobsDomainError(error)
  ) {
    return error;
  }

  if (HttpClientError.isHttpClientError(error)) {
    return new JobsRequestError({
      message: error.message,
    });
  }

  if (ParseResult.isParseError(error)) {
    return new JobsRequestError({
      message: "Jobs API returned an invalid payload.",
    });
  }

  if (error instanceof Error && error.message.length > 0) {
    return new JobsRequestError({
      message: error.message,
    });
  }

  return new JobsRequestError({
    message: "Jobs request failed.",
  });
}
