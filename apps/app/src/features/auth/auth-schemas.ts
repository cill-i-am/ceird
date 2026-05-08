import { ParseResult, Schema } from "effect";

export const accountEmailSchema = Schema.Trim.pipe(
  Schema.nonEmptyString(),
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
);

export const accountPasswordSchema = Schema.String.pipe(Schema.minLength(8));

export const accountNameSchema = Schema.Trim.pipe(Schema.minLength(2));

const LoginInputSchema = Schema.Struct({
  email: accountEmailSchema,
  password: accountPasswordSchema,
});

const SignupInputSchema = Schema.Struct({
  name: accountNameSchema,
  email: accountEmailSchema,
  password: accountPasswordSchema,
  confirmPassword: accountPasswordSchema,
}).pipe(
  Schema.filter((input) => input.password === input.confirmPassword),
  Schema.annotations({
    message: () => "Passwords must match",
  })
);

const PasswordResetRequestInputSchema = Schema.Struct({
  email: accountEmailSchema,
});

const PasswordResetInputSchema = Schema.Struct({
  password: accountPasswordSchema,
  confirmPassword: accountPasswordSchema,
}).pipe(
  Schema.filter((input) => input.password === input.confirmPassword),
  Schema.annotations({
    message: () => "Passwords must match",
  })
);

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
  return ParseResult.decodeUnknownSync(LoginInputSchema)(input);
}

export function decodeSignupInput(input: unknown): SignupInput {
  return ParseResult.decodeUnknownSync(SignupInputSchema)(input);
}

export function decodePasswordResetRequestInput(
  input: unknown
): PasswordResetRequestInput {
  return ParseResult.decodeUnknownSync(PasswordResetRequestInputSchema)(input);
}

export function decodePasswordResetInput(input: unknown): PasswordResetInput {
  return ParseResult.decodeUnknownSync(PasswordResetInputSchema)(input);
}
