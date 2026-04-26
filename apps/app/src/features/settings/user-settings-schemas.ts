/* oxlint-disable unicorn/no-array-method-this-argument */

import { ParseResult, Schema } from "effect";

const Email = Schema.Trim.pipe(
  Schema.nonEmptyString({
    message: () => "Enter a valid email address",
  }),
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
    message: () => "Enter a valid email address",
  })
);

const Password = Schema.Trim.pipe(
  Schema.minLength(8, {
    message: () => "Use 8 or more characters",
  })
);

const Name = Schema.Trim.pipe(
  Schema.minLength(2, {
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

      try {
        const url = new URL(value);

        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    {
      message: () => "Enter a valid http or https image URL",
    }
  )
);

const ProfileSettingsInput = Schema.Struct({
  name: Name,
  image: ImageUrl,
});

const ChangeEmailInput = Schema.Struct({
  email: Email,
});

const ChangePasswordInput = Schema.Struct({
  currentPassword: Password,
  newPassword: Password,
  confirmPassword: Password,
}).pipe(
  Schema.filter((input) => input.newPassword === input.confirmPassword, {
    message: () => "Passwords must match",
  })
);

export type ProfileSettingsInput = typeof ProfileSettingsInput.Type;
export type ChangeEmailInput = typeof ChangeEmailInput.Type;
export type ChangePasswordInput = typeof ChangePasswordInput.Type;

export const profileSettingsSchema = ProfileSettingsInput;
export const changeEmailSchema = ChangeEmailInput;
export const changePasswordSchema = ChangePasswordInput;

export function decodeProfileSettingsInput(
  input: unknown
): ProfileSettingsInput {
  return ParseResult.decodeUnknownSync(ProfileSettingsInput)(input);
}

export function decodeChangeEmailInput(input: unknown): ChangeEmailInput {
  return ParseResult.decodeUnknownSync(ChangeEmailInput)(input);
}

export function decodeChangePasswordInput(input: unknown): ChangePasswordInput {
  return ParseResult.decodeUnknownSync(ChangePasswordInput)(input);
}
