import { Schema } from "effect";

export const LabelId = Schema.UUID.pipe(
  Schema.brand("@ceird/labels-core/LabelId")
);
export type LabelId = Schema.Schema.Type<typeof LabelId>;
