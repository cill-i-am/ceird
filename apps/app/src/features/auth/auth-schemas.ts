import { ParseResult, Schema } from "effect";

const Email = Schema.String.pipe(
  Schema.trimmed(),
  Schema.nonEmptyString(),
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
);

const Password = Schema.String.pipe(Schema.minLength(8));

const Name = Schema.String.pipe(Schema.trimmed(), Schema.minLength(2));

const LoginInput = Schema.Struct({
  email: Email,
  password: Password,
});

const SignupInput = Schema.Struct({
  name: Name,
  email: Email,
  password: Password,
  confirmPassword: Password,
}).pipe(
  Schema.filter((input) => input.password === input.confirmPassword),
  Schema.annotations({
    message: () => "Passwords must match",
  })
);

export type LoginInput = typeof LoginInput.Type;
export type SignupInput = typeof SignupInput.Type;

export const loginSchema = LoginInput;
export const signupSchema = SignupInput;

export function decodeLoginInput(input: unknown): LoginInput {
  return ParseResult.decodeUnknownSync(LoginInput)(input);
}

export function decodeSignupInput(input: unknown): SignupInput {
  return ParseResult.decodeUnknownSync(SignupInput)(input);
}
