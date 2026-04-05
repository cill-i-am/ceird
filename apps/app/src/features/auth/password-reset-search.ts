import { ParseResult, Schema } from "effect";

const INVALID_TOKEN = "INVALID_TOKEN" as const;

const RawPasswordResetSearch = Schema.Struct({
  token: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Unknown),
});

const PasswordResetSearch = Schema.transform(
  RawPasswordResetSearch,
  Schema.Struct({
    token: Schema.optional(Schema.String),
    error: Schema.optional(Schema.Literal(INVALID_TOKEN)),
  }),
  {
    strict: true,
    decode: ({ error, token }) => {
      if (error === INVALID_TOKEN) {
        return { error: INVALID_TOKEN };
      }

      return typeof token === "string" && token.length > 0 ? { token } : {};
    },
    encode: (search) => search,
  }
);

export type PasswordResetSearch = typeof PasswordResetSearch.Type;

export function decodePasswordResetSearch(input: unknown): PasswordResetSearch {
  return ParseResult.decodeUnknownSync(PasswordResetSearch)(input);
}
