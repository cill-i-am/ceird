import { ParseResult, Schema } from "effect";

export const accountEmailSchema = Schema.Trim.pipe(
  Schema.nonEmptyString(),
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
);

export const accountPasswordSchema = Schema.String.pipe(Schema.minLength(8));

export const accountNameSchema = Schema.Trim.pipe(Schema.minLength(2));

const LoginInput = Schema.Struct({
  email: accountEmailSchema,
  password: accountPasswordSchema,
});

const SignupInput = Schema.Struct({
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

const PasswordResetRequestInput = Schema.Struct({
  email: accountEmailSchema,
});

const PasswordResetInput = Schema.Struct({
  password: accountPasswordSchema,
  confirmPassword: accountPasswordSchema,
}).pipe(
  Schema.filter((input) => input.password === input.confirmPassword),
  Schema.annotations({
    message: () => "Passwords must match",
  })
);

export type LoginInput = typeof LoginInput.Type;
export type SignupInput = typeof SignupInput.Type;
export type PasswordResetRequestInput = typeof PasswordResetRequestInput.Type;
export type PasswordResetInput = typeof PasswordResetInput.Type;

export const loginSchema = LoginInput;
export const signupSchema = SignupInput;
export const passwordResetRequestSchema = PasswordResetRequestInput;
export const passwordResetSchema = PasswordResetInput;

export function decodeLoginInput(input: unknown): LoginInput {
  return ParseResult.decodeUnknownSync(LoginInput)(input);
}

export function decodeSignupInput(input: unknown): SignupInput {
  return ParseResult.decodeUnknownSync(SignupInput)(input);
}

export function decodePasswordResetRequestInput(
  input: unknown
): PasswordResetRequestInput {
  return ParseResult.decodeUnknownSync(PasswordResetRequestInput)(input);
}

export function decodePasswordResetInput(input: unknown): PasswordResetInput {
  return ParseResult.decodeUnknownSync(PasswordResetInput)(input);
}
