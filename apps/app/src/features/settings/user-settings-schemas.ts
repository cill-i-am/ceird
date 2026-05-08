/* oxlint-disable unicorn/no-array-method-this-argument */

import { ParseResult, Schema } from "effect";

import {
  accountEmailSchema,
  accountNameSchema,
  accountPasswordSchema,
} from "#/features/auth/auth-schemas";

const SettingsEmail = accountEmailSchema.pipe(
  Schema.annotations({
    message: () => "Enter a valid email address",
  })
);

const SettingsPassword = accountPasswordSchema.pipe(
  Schema.annotations({
    message: () => "Use 8 or more characters",
  })
);

const SettingsName = accountNameSchema.pipe(
  Schema.annotations({
    message: () => "Use at least 2 characters",
  })
);

const ImageUrl = Schema.transform(Schema.Trim, Schema.NullOr(Schema.String), {
  strict: true,
  decode: (value) => (value.length === 0 ? null : value),
  encode: (value) => value ?? "",
}).pipe(
  Schema.filter(
    (value) => {
      if (value === null) {
        return true;
      }

      if (!URL.canParse(value)) {
        return false;
      }

      const url = new URL(value);

      return url.protocol === "http:" || url.protocol === "https:";
    },
    {
      message: () => "Enter a valid http or https image URL",
    }
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
  currentPassword: SettingsPassword,
  newPassword: SettingsPassword,
  confirmPassword: SettingsPassword,
}).pipe(
  Schema.filter((input) => input.newPassword === input.confirmPassword, {
    message: () => "Passwords must match",
  }),
  Schema.filter((input) => input.currentPassword !== input.newPassword, {
    message: () =>
      "Use a new password that is different from your current password",
  })
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
  return ParseResult.decodeUnknownSync(ProfileSettingsInputSchema)(input);
}

export function decodeChangeEmailInput(input: unknown): ChangeEmailInput {
  return ParseResult.decodeUnknownSync(ChangeEmailInputSchema)(input);
}

export function decodeChangePasswordInput(input: unknown): ChangePasswordInput {
  return ParseResult.decodeUnknownSync(ChangePasswordInputSchema)(input);
}
