import type {
  AgentAccessDeniedError,
  AgentActionRejectedError,
  AgentStorageError,
  AgentThreadNotFoundError,
} from "@ceird/agents-core";
import type { IdentityError } from "@ceird/identity-core";
import type { JobsError } from "@ceird/jobs-core";
import type { LabelsError } from "@ceird/labels-core";
import type { ProximityError } from "@ceird/proximity-core";
import type { SitesError } from "@ceird/sites-core";
import { Schema } from "effect";
/* oxlint-disable eslint/max-classes-per-file */
import { HttpClientError } from "effect/unstable/http";

const APP_API_DOMAIN_ERROR_TAG_PREFIXES = [
  "@ceird/agents-core/",
  "@ceird/identity-core/",
  "@ceird/jobs-core/",
  "@ceird/labels-core/",
  "@ceird/proximity-core/",
  "@ceird/sites-core/",
] as const;

export const APP_API_ORIGIN_RESOLUTION_ERROR_TAG =
  "@ceird/app/api/AppApiOriginResolutionError" as const;
export class AppApiOriginResolutionError extends Schema.TaggedErrorClass<AppApiOriginResolutionError>()(
  APP_API_ORIGIN_RESOLUTION_ERROR_TAG,
  {
    message: Schema.String,
  }
) {}

export const APP_API_REQUEST_ERROR_TAG =
  "@ceird/app/api/AppApiRequestError" as const;
export class AppApiRequestError extends Schema.TaggedErrorClass<AppApiRequestError>()(
  APP_API_REQUEST_ERROR_TAG,
  {
    message: Schema.String,
  }
) {}

type AgentsError =
  | AgentAccessDeniedError
  | AgentActionRejectedError
  | AgentStorageError
  | AgentThreadNotFoundError;
type AppApiDomainError =
  | AgentsError
  | IdentityError
  | JobsError
  | LabelsError
  | ProximityError
  | SitesError;
export type AppApiError =
  | AppApiDomainError
  | AppApiOriginResolutionError
  | AppApiRequestError;

function isAppApiDomainError(error: unknown): error is AppApiDomainError {
  const tag =
    typeof error === "object" && error !== null && "_tag" in error
      ? error._tag
      : undefined;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? error.message
      : undefined;

  return (
    typeof tag === "string" &&
    APP_API_DOMAIN_ERROR_TAG_PREFIXES.some((prefix) =>
      tag.startsWith(prefix)
    ) &&
    typeof message === "string"
  );
}

export function normalizeAppApiError(error: unknown): AppApiError {
  if (
    error instanceof AppApiOriginResolutionError ||
    error instanceof AppApiRequestError ||
    isAppApiDomainError(error)
  ) {
    return error;
  }

  if (HttpClientError.isHttpClientError(error)) {
    return new AppApiRequestError({
      message: error.message,
    });
  }

  if (Schema.isSchemaError(error)) {
    return new AppApiRequestError({
      message: "Ceird API returned an invalid payload.",
    });
  }

  if (error instanceof Error && error.message.length > 0) {
    return new AppApiRequestError({
      message: error.message,
    });
  }

  return new AppApiRequestError({
    message: "Ceird API request failed.",
  });
}
