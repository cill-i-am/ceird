import { Schema } from "effect";

import { LabelNameSchema, IsoDateTimeString } from "./domain.js";
import { LabelId } from "./ids.js";

const MAX_ELECTRIC_MUTATION_TXID = 4_294_967_295;

export const LabelSchema = Schema.Struct({
  id: LabelId,
  name: LabelNameSchema,
  createdAt: IsoDateTimeString,
  updatedAt: IsoDateTimeString,
});
export type Label = Schema.Schema.Type<typeof LabelSchema>;

export const CreateLabelInputSchema = Schema.Struct({
  name: LabelNameSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type CreateLabelInput = Schema.Schema.Type<
  typeof CreateLabelInputSchema
>;

export const UpdateLabelInputSchema = Schema.Struct({
  name: LabelNameSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type UpdateLabelInput = Schema.Schema.Type<
  typeof UpdateLabelInputSchema
>;

export const ElectricMutationConfirmationSchema = Schema.Struct({
  txid: Schema.Number.pipe(
    Schema.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(0),
      Schema.isLessThanOrEqualTo(MAX_ELECTRIC_MUTATION_TXID)
    )
  ),
});
export type ElectricMutationConfirmation = Schema.Schema.Type<
  typeof ElectricMutationConfirmationSchema
>;

export const LabelWriteResponseSchema = Schema.Struct({
  label: LabelSchema,
  mutation: ElectricMutationConfirmationSchema,
});
export type LabelWriteResponse = Schema.Schema.Type<
  typeof LabelWriteResponseSchema
>;

export const LabelsResponseSchema = Schema.Struct({
  labels: Schema.Array(LabelSchema),
});
export type LabelsResponse = Schema.Schema.Type<typeof LabelsResponseSchema>;
