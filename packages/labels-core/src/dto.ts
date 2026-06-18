import { Effect, Schema } from "effect";

import {
  DEFAULT_LABEL_COLOR,
  LabelColorSchema,
  LabelDescriptionSchema,
  LabelNameSchema,
  IsoDateTimeString,
} from "./domain.js";
import { LabelId } from "./ids.js";

const MAX_ELECTRIC_MUTATION_TXID = 4_294_967_295;

export const LabelListStatusSchema = Schema.Literals([
  "active",
  "archived",
  "all",
] as const);
export type LabelListStatus = Schema.Schema.Type<typeof LabelListStatusSchema>;

export const LabelSchema = Schema.Struct({
  archivedAt: Schema.NullOr(IsoDateTimeString),
  color: LabelColorSchema,
  description: Schema.NullOr(LabelDescriptionSchema),
  id: LabelId,
  name: LabelNameSchema,
  createdAt: IsoDateTimeString,
  updatedAt: IsoDateTimeString,
});
export type Label = Schema.Schema.Type<typeof LabelSchema>;

export const CreateLabelInputSchema = Schema.Struct({
  color: LabelColorSchema.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(DEFAULT_LABEL_COLOR))
  ),
  description: Schema.NullOr(LabelDescriptionSchema).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  name: LabelNameSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type CreateLabelInput = Schema.Schema.Type<
  typeof CreateLabelInputSchema
>;

export const UpdateLabelInputSchema = Schema.Struct({
  color: LabelColorSchema.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(DEFAULT_LABEL_COLOR))
  ),
  description: Schema.NullOr(LabelDescriptionSchema).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
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

export const LabelReadResponseSchema = Schema.Struct({
  label: LabelSchema,
});
export type LabelReadResponse = Schema.Schema.Type<
  typeof LabelReadResponseSchema
>;

export const ListLabelsQuerySchema = Schema.Struct({
  status: Schema.optional(LabelListStatusSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ListLabelsQuery = Schema.Schema.Type<typeof ListLabelsQuerySchema>;
