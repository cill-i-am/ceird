import { Schema } from "effect";

export const ACCOUNT_PASSWORD_MIN_LENGTH = 12 as const;
export const ACCOUNT_PASSWORD_MAX_LENGTH = 256 as const;
export const ACCOUNT_PASSWORD_LENGTH_MESSAGE =
  "Use 12 to 256 characters." as const;

export const accountEmailSchema = Schema.Trim.pipe(
  Schema.check(
    Schema.isNonEmpty(),
    Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  )
);

export const accountPasswordSchema = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(ACCOUNT_PASSWORD_MIN_LENGTH),
    Schema.isMaxLength(ACCOUNT_PASSWORD_MAX_LENGTH)
  ),
  Schema.annotate({
    message: ACCOUNT_PASSWORD_LENGTH_MESSAGE,
  })
);
export const loginPasswordSchema = Schema.String.pipe(
  Schema.check(Schema.isNonEmpty())
);

export const accountNameSchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(2))
);

const LoginInputSchema = Schema.Struct({
  email: accountEmailSchema,
  password: loginPasswordSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const SignupInputSchema = Schema.Struct({
  name: accountNameSchema,
  email: accountEmailSchema,
  password: accountPasswordSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const PasswordResetRequestInputSchema = Schema.Struct({
  email: accountEmailSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const PasswordResetInputSchema = Schema.Struct({
  password: accountPasswordSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type LoginInput = typeof LoginInputSchema.Type;
export type SignupInput = typeof SignupInputSchema.Type;
export type PasswordResetRequestInput =
  typeof PasswordResetRequestInputSchema.Type;
export type PasswordResetInput = typeof PasswordResetInputSchema.Type;

export const loginSchema = LoginInputSchema;
export const signupSchema = SignupInputSchema;
export const passwordResetRequestSchema = PasswordResetRequestInputSchema;
export const passwordResetSchema = PasswordResetInputSchema;

export function decodeLoginInput(input: unknown): LoginInput {
  return Schema.decodeUnknownSync(LoginInputSchema)(input);
}

export function decodeSignupInput(input: unknown): SignupInput {
  return Schema.decodeUnknownSync(SignupInputSchema)(input);
}

export function decodePasswordResetRequestInput(
  input: unknown
): PasswordResetRequestInput {
  return Schema.decodeUnknownSync(PasswordResetRequestInputSchema)(input);
}

export function decodePasswordResetInput(input: unknown): PasswordResetInput {
  return Schema.decodeUnknownSync(PasswordResetInputSchema)(input);
}
