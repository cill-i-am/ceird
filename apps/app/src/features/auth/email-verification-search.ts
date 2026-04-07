import { ParseResult, Schema } from "effect";

const INVALID_TOKEN = "invalid_token" as const;
const SUCCESS_STATUS = { status: "success" } as const;
const INVALID_TOKEN_STATUS = { status: "invalid-token" } as const;

const RawEmailVerificationSearch = Schema.Struct({
  error: Schema.optional(Schema.Unknown),
});

const EmailVerificationSearch = Schema.transform(
  RawEmailVerificationSearch,
  Schema.Union(
    Schema.Struct({
      status: Schema.Literal("success"),
    }),
    Schema.Struct({
      status: Schema.Literal("invalid-token"),
    })
  ),
  {
    strict: true,
    decode: ({ error }) =>
      error === INVALID_TOKEN ? INVALID_TOKEN_STATUS : SUCCESS_STATUS,
    encode: (search) =>
      search.status === "invalid-token" ? { error: INVALID_TOKEN } : {},
  }
);

export type EmailVerificationSearch = typeof EmailVerificationSearch.Type;

export function decodeEmailVerificationSearch(
  input: unknown
): EmailVerificationSearch {
  return ParseResult.decodeUnknownSync(EmailVerificationSearch)(input);
}
