/* oxlint-disable eslint/max-classes-per-file */

import { HttpApiSchema } from "@effect/platform";
import { Schema } from "effect";

import { LabelNameSchema } from "./domain.js";
import { LabelId } from "./ids.js";

export const LABEL_ACCESS_DENIED_ERROR_TAG =
  "@ceird/labels-core/LabelAccessDeniedError" as const;
export class LabelAccessDeniedError extends Schema.TaggedError<LabelAccessDeniedError>()(
  LABEL_ACCESS_DENIED_ERROR_TAG,
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 403 })
) {}

export const LABEL_STORAGE_ERROR_TAG =
  "@ceird/labels-core/LabelStorageError" as const;
export class LabelStorageError extends Schema.TaggedError<LabelStorageError>()(
  LABEL_STORAGE_ERROR_TAG,
  {
    message: Schema.String,
    cause: Schema.optional(Schema.String),
  },
  HttpApiSchema.annotations({ status: 503 })
) {}

export const LABEL_NOT_FOUND_ERROR_TAG =
  "@ceird/labels-core/LabelNotFoundError" as const;
export class LabelNotFoundError extends Schema.TaggedError<LabelNotFoundError>()(
  LABEL_NOT_FOUND_ERROR_TAG,
  {
    labelId: Schema.optional(LabelId),
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export const LABEL_NAME_CONFLICT_ERROR_TAG =
  "@ceird/labels-core/LabelNameConflictError" as const;
export class LabelNameConflictError extends Schema.TaggedError<LabelNameConflictError>()(
  LABEL_NAME_CONFLICT_ERROR_TAG,
  {
    message: Schema.String,
    name: LabelNameSchema,
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

export type LabelsError =
  | LabelAccessDeniedError
  | LabelStorageError
  | LabelNotFoundError
  | LabelNameConflictError;
