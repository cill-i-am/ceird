import { IsoDateTimeString as IdentityIsoDateTimeString } from "@ceird/identity-core";
import { Schema } from "effect";

export const IsoDateTimeString = IdentityIsoDateTimeString;
export type IsoDateTimeString = Schema.Schema.Type<typeof IsoDateTimeString>;

export const LabelNameSchema = Schema.Trim.pipe(
  Schema.minLength(1),
  Schema.maxLength(48)
);
export type LabelName = Schema.Schema.Type<typeof LabelNameSchema>;

export function normalizeLabelName(name: string): string {
  return name.trim().replaceAll(/\s+/g, " ").toLocaleLowerCase("en");
}
