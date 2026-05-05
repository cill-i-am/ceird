import { LabelNameSchema } from "@ceird/labels-core";
import type { CreateLabelInput } from "@ceird/labels-core";
import { Schema } from "effect";

const decodeLabelName = Schema.decodeUnknownSync(LabelNameSchema);

export function validateLabelName(
  input: string
):
  | { readonly kind: "empty" }
  | { readonly kind: "invalid" }
  | { readonly kind: "valid"; readonly name: CreateLabelInput["name"] } {
  if (input.trim().length === 0) {
    return { kind: "empty" };
  }

  try {
    return {
      kind: "valid",
      name: decodeLabelName(input),
    };
  } catch {
    return { kind: "invalid" };
  }
}
