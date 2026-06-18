import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";

import {
  CreateLabelInputSchema,
  LabelReadResponseSchema,
  LabelWriteResponseSchema,
  LabelsResponseSchema,
  ListLabelsQuerySchema,
  UpdateLabelInputSchema,
} from "./dto.js";
import {
  LabelAccessDeniedError,
  LabelNameConflictError,
  LabelNotFoundError,
  LabelRestoreConflictError,
  LabelStorageError,
} from "./errors.js";
import { LabelId } from "./ids.js";

const labelsGroup = HttpApiGroup.make("labels")
  .add(
    HttpApiEndpoint.get("listLabels", "/labels", {
      query: ListLabelsQuerySchema,
      success: LabelsResponseSchema,
      error: [LabelAccessDeniedError, LabelStorageError],
    })
  )
  .add(
    HttpApiEndpoint.get("readLabel", "/labels/:labelId", {
      params: { labelId: LabelId },
      success: LabelReadResponseSchema,
      error: [LabelAccessDeniedError, LabelNotFoundError, LabelStorageError],
    })
  )
  .add(
    HttpApiEndpoint.post("createLabel", "/labels", {
      payload: CreateLabelInputSchema,
      success: LabelWriteResponseSchema.pipe(HttpApiSchema.status("Created")),
      error: [
        LabelAccessDeniedError,
        LabelNameConflictError,
        LabelStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.patch("updateLabel", "/labels/:labelId", {
      params: { labelId: LabelId },
      payload: UpdateLabelInputSchema,
      success: LabelWriteResponseSchema,
      error: [
        LabelAccessDeniedError,
        LabelNotFoundError,
        LabelNameConflictError,
        LabelStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.delete("archiveLabel", "/labels/:labelId", {
      params: { labelId: LabelId },
      success: LabelWriteResponseSchema,
      error: [LabelAccessDeniedError, LabelNotFoundError, LabelStorageError],
    })
  )
  .add(
    HttpApiEndpoint.post("restoreLabel", "/labels/:labelId/restore", {
      params: { labelId: LabelId },
      success: LabelWriteResponseSchema,
      error: [
        LabelAccessDeniedError,
        LabelNotFoundError,
        LabelRestoreConflictError,
        LabelStorageError,
      ],
    })
  );

export const LabelsApiGroup = labelsGroup;

export const LabelsApi = HttpApi.make("LabelsApi").add(LabelsApiGroup);

export type LabelsApiGroupType = typeof LabelsApiGroup;
export type LabelsApiType = typeof LabelsApi;
