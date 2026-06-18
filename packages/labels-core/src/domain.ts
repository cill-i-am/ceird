import { IsoDateTimeString as IdentityIsoDateTimeString } from "@ceird/identity-core";
import { Schema } from "effect";

export const IsoDateTimeString = IdentityIsoDateTimeString;
export type IsoDateTimeString = Schema.Schema.Type<typeof IsoDateTimeString>;

export const LABEL_COLOR_OPTIONS = [
  {
    color: "oklch(64% 0.19 28)",
    id: "muted-red",
    name: "Muted red",
    role: "Urgent, blocked, or risk-heavy work",
  },
  {
    color: "oklch(72% 0.16 75)",
    id: "amber",
    name: "Amber",
    role: "Waiting, review, or attention needed",
  },
  {
    color: "oklch(68% 0.17 145)",
    id: "green",
    name: "Green",
    role: "Ready, approved, or progressing work",
  },
  {
    color: "oklch(67% 0.15 196)",
    id: "cyan",
    name: "Cyan",
    role: "Site, access, or field context",
  },
  {
    color: "oklch(63% 0.18 255)",
    id: "blue",
    name: "Blue",
    role: "Planning, coordination, or general workflow",
  },
  {
    color: "oklch(65% 0.18 302)",
    id: "purple",
    name: "Purple",
    role: "Specialist, finance, or admin work",
  },
  {
    color: "oklch(66% 0.17 340)",
    id: "rose",
    name: "Rose",
    role: "Customer, follow-up, or sensitive work",
  },
  {
    color: "oklch(70% 0.11 110)",
    id: "moss",
    name: "Moss",
    role: "Maintenance, recurring, or neutral work",
  },
  {
    color: "oklch(69% 0.04 250)",
    id: "slate",
    name: "Slate",
    role: "Neutral taxonomy and low-signal categories",
  },
] as const;
export const LABEL_COLOR_BANK = [
  LABEL_COLOR_OPTIONS[0].color,
  LABEL_COLOR_OPTIONS[1].color,
  LABEL_COLOR_OPTIONS[2].color,
  LABEL_COLOR_OPTIONS[3].color,
  LABEL_COLOR_OPTIONS[4].color,
  LABEL_COLOR_OPTIONS[5].color,
  LABEL_COLOR_OPTIONS[6].color,
  LABEL_COLOR_OPTIONS[7].color,
  LABEL_COLOR_OPTIONS[8].color,
] as const;
export const [DEFAULT_LABEL_COLOR] = LABEL_COLOR_BANK;
export type LabelColorOption = (typeof LABEL_COLOR_OPTIONS)[number];

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
