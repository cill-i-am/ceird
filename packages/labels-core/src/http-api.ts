import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";

import {
  CreateLabelInputSchema,
  LabelResponseSchema,
  LabelsResponseSchema,
  UpdateLabelInputSchema,
} from "./dto.js";
import {
  LabelAccessDeniedError,
  LabelNameConflictError,
  LabelNotFoundError,
  LabelStorageError,
} from "./errors.js";
import { LabelId } from "./ids.js";

const labelsGroup = HttpApiGroup.make("labels")
  .add(
    HttpApiEndpoint.get("listLabels", "/labels", {
      success: LabelsResponseSchema,
      error: [LabelAccessDeniedError, LabelStorageError],
    })
  )
  .add(
    HttpApiEndpoint.post("createLabel", "/labels", {
      payload: CreateLabelInputSchema,
      success: LabelResponseSchema.pipe(HttpApiSchema.status("Created")),
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
      success: LabelResponseSchema,
      error: [
        LabelAccessDeniedError,
        LabelNotFoundError,
        LabelNameConflictError,
        LabelStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.delete("deleteLabel", "/labels/:labelId", {
      params: { labelId: LabelId },
      success: LabelResponseSchema,
      error: [LabelAccessDeniedError, LabelNotFoundError, LabelStorageError],
    })
  );

export const LabelsApiGroup = labelsGroup;

export const LabelsApi = HttpApi.make("LabelsApi").add(LabelsApiGroup);

export type LabelsApiGroupType = typeof LabelsApiGroup;
export type LabelsApiType = typeof LabelsApi;
