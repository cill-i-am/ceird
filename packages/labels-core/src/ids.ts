import { Schema } from "effect";

export const LabelId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@ceird/labels-core/LabelId")
);
export type LabelId = Schema.Schema.Type<typeof LabelId>;
