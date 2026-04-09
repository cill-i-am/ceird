import { ParseResult, Schema } from "effect";

const INVALID_TOKEN = "INVALID_TOKEN" as const;
const SUCCESS_STATUS = { status: "success" } as const;
const INVALID_TOKEN_STATUS = { status: "invalid-token" } as const;

const RawEmailVerificationSearch = Schema.Struct({
  error: Schema.optional(Schema.Unknown),
  status: Schema.optional(Schema.Unknown),
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
    decode: ({ error, status }) => {
      if (typeof error === "string") {
        return INVALID_TOKEN_STATUS;
      }

      return status === "success" ? SUCCESS_STATUS : INVALID_TOKEN_STATUS;
    },
    encode: (search) =>
      search.status === "invalid-token"
        ? { error: INVALID_TOKEN }
        : { status: "success" },
  }
);

export type EmailVerificationSearch = typeof EmailVerificationSearch.Type;

export function decodeEmailVerificationSearch(
  input: unknown
): EmailVerificationSearch {
  return ParseResult.decodeUnknownSync(EmailVerificationSearch)(input);
}
