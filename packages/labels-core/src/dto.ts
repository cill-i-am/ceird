import { Schema } from "effect";

import { LabelNameSchema, IsoDateTimeString } from "./domain.js";
import { LabelId } from "./ids.js";

export const LabelSchema = Schema.Struct({
  id: LabelId,
  name: LabelNameSchema,
  createdAt: IsoDateTimeString,
  updatedAt: IsoDateTimeString,
});
export type Label = Schema.Schema.Type<typeof LabelSchema>;

export const CreateLabelInputSchema = Schema.Struct({
  name: LabelNameSchema,
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type CreateLabelInput = Schema.Schema.Type<
  typeof CreateLabelInputSchema
>;

export const UpdateLabelInputSchema = Schema.Struct({
  name: LabelNameSchema,
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type UpdateLabelInput = Schema.Schema.Type<
  typeof UpdateLabelInputSchema
>;

export const LabelResponseSchema = LabelSchema;
export type LabelResponse = Schema.Schema.Type<typeof LabelResponseSchema>;

export const LabelsResponseSchema = Schema.Struct({
  labels: Schema.Array(LabelSchema),
});
export type LabelsResponse = Schema.Schema.Type<typeof LabelsResponseSchema>;
