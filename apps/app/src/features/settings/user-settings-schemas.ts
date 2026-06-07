/* oxlint-disable unicorn/no-array-method-this-argument */

import { Schema, SchemaGetter } from "effect";

import {
  accountEmailSchema,
  accountNameSchema,
  accountPasswordSchema,
  ACCOUNT_PASSWORD_LENGTH_MESSAGE,
} from "#/features/auth/auth-schemas";

const SettingsEmail = accountEmailSchema.pipe(
  Schema.annotate({
    message: "Enter a valid email address",
  })
);

const SettingsPassword = accountPasswordSchema.pipe(
  Schema.annotate({
    message: ACCOUNT_PASSWORD_LENGTH_MESSAGE,
  })
);

const SettingsCurrentPassword = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.annotate({
    message: "Enter your current password",
  })
);

const SettingsName = accountNameSchema.pipe(
  Schema.annotate({
    message: "Use at least 2 characters",
  })
);

const ImageUrl = Schema.Trim.pipe(
  Schema.decodeTo(Schema.NullOr(Schema.String), {
    decode: SchemaGetter.transform((value) =>
      value.length === 0 ? null : value
    ),
    encode: SchemaGetter.transform((value) => value ?? ""),
  }),
  Schema.refine(
    (value): value is string | null => {
      if (value === null) {
        return true;
      }

      if (!URL.canParse(value)) {
        return false;
      }

      const url = new URL(value);

      return url.protocol === "http:" || url.protocol === "https:";
    },
    { message: "Enter a valid http or https image URL" }
  )
);

const ProfileSettingsInputSchema = Schema.Struct({
  name: SettingsName,
  image: ImageUrl,
});

const ChangeEmailInputSchema = Schema.Struct({
  email: SettingsEmail,
});

const ChangePasswordInputSchema = Schema.Struct({
  currentPassword: SettingsCurrentPassword,
  newPassword: SettingsPassword,
  confirmPassword: SettingsPassword,
}).pipe(
  Schema.check(
    Schema.makeFilter((input) => input.newPassword === input.confirmPassword, {
      message: "Passwords must match",
    }),
    Schema.makeFilter((input) => input.currentPassword !== input.newPassword, {
      message:
        "Use a new password that is different from your current password",
    })
  )
);

export type ProfileSettingsInput = typeof ProfileSettingsInputSchema.Type;
export type ChangeEmailInput = typeof ChangeEmailInputSchema.Type;
export type ChangePasswordInput = typeof ChangePasswordInputSchema.Type;

export const profileSettingsSchema = ProfileSettingsInputSchema;
export const changeEmailSchema = ChangeEmailInputSchema;
export const changePasswordSchema = ChangePasswordInputSchema;

export function decodeProfileSettingsInput(
  input: unknown
): ProfileSettingsInput {
  return Schema.decodeUnknownSync(ProfileSettingsInputSchema)(input);
}

export function decodeChangeEmailInput(input: unknown): ChangeEmailInput {
  return Schema.decodeUnknownSync(ChangeEmailInputSchema)(input);
}

export function decodeChangePasswordInput(input: unknown): ChangePasswordInput {
  return Schema.decodeUnknownSync(ChangePasswordInputSchema)(input);
}
