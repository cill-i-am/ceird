import { LabelId } from "@ceird/labels-core";
import type { LabelIdType } from "@ceird/labels-core";
import { Schema } from "effect";
import { v7 as uuidv7 } from "uuid";

const decodeLabelId = Schema.decodeUnknownSync(LabelId);

export function generateLabelId(): LabelIdType {
  return decodeLabelId(uuidv7());
}
