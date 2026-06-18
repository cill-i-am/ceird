/* oxlint-disable eslint/max-classes-per-file */

import { Schema } from "effect";

import { LabelNameSchema } from "./domain.js";
import { LabelId } from "./ids.js";

export const LABEL_ACCESS_DENIED_ERROR_TAG =
  "@ceird/labels-core/LabelAccessDeniedError" as const;
export class LabelAccessDeniedError extends Schema.TaggedErrorClass<LabelAccessDeniedError>()(
  LABEL_ACCESS_DENIED_ERROR_TAG,
  {
    message: Schema.String,
  },
  { httpApiStatus: 403 }
) {}

export const LABEL_STORAGE_ERROR_TAG =
  "@ceird/labels-core/LabelStorageError" as const;
export class LabelStorageError extends Schema.TaggedErrorClass<LabelStorageError>()(
  LABEL_STORAGE_ERROR_TAG,
  {
    message: Schema.String,
    cause: Schema.optional(Schema.String),
  },
  { httpApiStatus: 503 }
) {}

export const LABEL_NOT_FOUND_ERROR_TAG =
  "@ceird/labels-core/LabelNotFoundError" as const;
export class LabelNotFoundError extends Schema.TaggedErrorClass<LabelNotFoundError>()(
  LABEL_NOT_FOUND_ERROR_TAG,
  {
    labelId: Schema.optional(LabelId),
    message: Schema.String,
  },
  { httpApiStatus: 404 }
) {}

export const LABEL_NAME_CONFLICT_ERROR_TAG =
  "@ceird/labels-core/LabelNameConflictError" as const;
export class LabelNameConflictError extends Schema.TaggedErrorClass<LabelNameConflictError>()(
  LABEL_NAME_CONFLICT_ERROR_TAG,
  {
    message: Schema.String,
    name: LabelNameSchema,
  },
  { httpApiStatus: 409 }
) {}

export const LABEL_RESTORE_CONFLICT_ERROR_TAG =
  "@ceird/labels-core/LabelRestoreConflictError" as const;
export class LabelRestoreConflictError extends Schema.TaggedErrorClass<LabelRestoreConflictError>()(
  LABEL_RESTORE_CONFLICT_ERROR_TAG,
  {
    activeLabelId: Schema.optional(LabelId),
    labelId: LabelId,
    message: Schema.String,
    name: LabelNameSchema,
  },
  { httpApiStatus: 409 }
) {}

export type LabelsError =
  | LabelAccessDeniedError
  | LabelStorageError
  | LabelNotFoundError
  | LabelNameConflictError
  | LabelRestoreConflictError;
