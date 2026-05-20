import { Schema } from "effect";

const SUCCESS_STATUS = { status: "success" } as const;
const INVALID_TOKEN_STATUS = { status: "invalid-token" } as const;

const RawEmailVerificationSearch = Schema.Struct({
  error: Schema.optional(Schema.Unknown),
  status: Schema.optional(Schema.Unknown),
});

const EmailVerificationSearch = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("success"),
  }),
  Schema.Struct({
    status: Schema.Literal("invalid-token"),
  }),
]);

export type EmailVerificationSearch = typeof EmailVerificationSearch.Type;

export function decodeEmailVerificationSearch(
  input: unknown
): EmailVerificationSearch {
  const { error, status } = Schema.decodeUnknownSync(
    RawEmailVerificationSearch
  )(input);

  if (typeof error === "string") {
    return INVALID_TOKEN_STATUS;
  }

  if (status === "success") {
    return SUCCESS_STATUS;
  }

  return INVALID_TOKEN_STATUS;
}
