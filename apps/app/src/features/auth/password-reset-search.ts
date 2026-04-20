import { ParseResult, Schema } from "effect";

const INVALID_TOKEN = "INVALID_TOKEN" as const;

const RawPasswordResetSearch = Schema.Struct({
  invitation: Schema.optional(Schema.Unknown),
  token: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Unknown),
});

const PasswordResetSearch = Schema.transform(
  RawPasswordResetSearch,
  Schema.Struct({
    invitation: Schema.optional(Schema.String),
    token: Schema.optional(Schema.String),
    error: Schema.optional(Schema.Literal(INVALID_TOKEN)),
  }),
  {
    strict: true,
    decode: ({ error, invitation, token }) => {
      const invitationSearch =
        typeof invitation === "string" && invitation.length > 0
          ? { invitation }
          : {};

      if (error === INVALID_TOKEN) {
        return { ...invitationSearch, error: INVALID_TOKEN };
      }

      return typeof token === "string" && token.length > 0
        ? { ...invitationSearch, token }
        : invitationSearch;
    },
    encode: (search) => search,
  }
);

export type PasswordResetSearch = typeof PasswordResetSearch.Type;

export function decodePasswordResetSearch(input: unknown): PasswordResetSearch {
  return ParseResult.decodeUnknownSync(PasswordResetSearch)(input);
}
