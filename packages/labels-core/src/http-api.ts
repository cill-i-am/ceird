import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";

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
    HttpApiEndpoint.get("listLabels", "/labels")
      .addSuccess(LabelsResponseSchema)
      .addError(LabelAccessDeniedError)
      .addError(LabelStorageError)
  )
  .add(
    HttpApiEndpoint.post("createLabel", "/labels")
      .setPayload(CreateLabelInputSchema)
      .addSuccess(LabelResponseSchema, { status: 201 })
      .addError(LabelAccessDeniedError)
      .addError(LabelNameConflictError)
      .addError(LabelStorageError)
  )
  .add(
    HttpApiEndpoint.patch("updateLabel", "/labels/:labelId")
      .setPath(Schema.Struct({ labelId: LabelId }))
      .setPayload(UpdateLabelInputSchema)
      .addSuccess(LabelResponseSchema)
      .addError(LabelAccessDeniedError)
      .addError(LabelNotFoundError)
      .addError(LabelNameConflictError)
      .addError(LabelStorageError)
  )
  .add(
    HttpApiEndpoint.del("deleteLabel", "/labels/:labelId")
      .setPath(Schema.Struct({ labelId: LabelId }))
      .addSuccess(LabelResponseSchema)
      .addError(LabelAccessDeniedError)
      .addError(LabelNotFoundError)
      .addError(LabelStorageError)
  );

export const LabelsApiGroup = labelsGroup;

export const LabelsApi = HttpApi.make("LabelsApi").add(LabelsApiGroup);

export type LabelsApiGroupType = typeof LabelsApiGroup;
export type LabelsApiType = typeof LabelsApi;
