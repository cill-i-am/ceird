import { IsoDateTimeString as IdentityIsoDateTimeString } from "@ceird/identity-core";
import { Schema } from "effect";

export const IsoDateTimeString = IdentityIsoDateTimeString;
export type IsoDateTimeString = Schema.Schema.Type<typeof IsoDateTimeString>;

export const LABEL_COLOR_BANK = [
  "oklch(64% 0.19 28)",
  "oklch(72% 0.16 75)",
  "oklch(68% 0.17 145)",
  "oklch(67% 0.15 196)",
  "oklch(63% 0.18 255)",
  "oklch(65% 0.18 302)",
  "oklch(66% 0.17 340)",
  "oklch(70% 0.11 110)",
] as const;
export const [DEFAULT_LABEL_COLOR] = LABEL_COLOR_BANK;

export const LabelNameSchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1), Schema.isMaxLength(48))
);
export type LabelName = Schema.Schema.Type<typeof LabelNameSchema>;

export const LabelColorSchema = Schema.Trim.pipe(
  Schema.refine((value): value is string => isCanonicalOklchColor(value), {
    message: "Expected canonical OKLCH color like oklch(64% 0.19 28)",
  })
);
export type LabelColor = Schema.Schema.Type<typeof LabelColorSchema>;

export const LabelDescriptionSchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1), Schema.isMaxLength(280))
);
export type LabelDescription = Schema.Schema.Type<
  typeof LabelDescriptionSchema
>;

export function normalizeLabelName(name: string): string {
  return name.trim().replaceAll(/\s+/g, " ").toLocaleLowerCase("en");
}

export function normalizeLabelDescription(
  description: string | null
): LabelDescription | null {
  const normalized = description?.trim() ?? "";

  if (normalized.length === 0) {
    return null;
  }

  return Schema.decodeUnknownSync(LabelDescriptionSchema)(normalized);
}

const OKLCH_COLOR_PATTERN =
  /^oklch\((\d{1,3}(?:\.\d{1,3})?)% (0(?:\.\d{1,4})?|[1-9]\d*(?:\.\d{1,4})?) (\d{1,3}(?:\.\d{1,3})?)\)$/;

export function isCanonicalOklchColor(value: string): boolean {
  const match = OKLCH_COLOR_PATTERN.exec(value);

  if (match === null) {
    return false;
  }

  const lightness = Number(match[1]);
  const chroma = Number(match[2]);
  const hue = Number(match[3]);

  return (
    lightness >= 0 &&
    lightness <= 100 &&
    chroma >= 0 &&
    chroma <= 0.4 &&
    hue >= 0 &&
    hue < 360
  );
}
