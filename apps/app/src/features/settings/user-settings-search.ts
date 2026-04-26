import { ParseResult, Schema } from "effect";

const EMAIL_CHANGE_COMPLETE = "complete" as const;
const EMAIL_CHANGE_FAILED = "failed" as const;

const RawUserSettingsSearch = Schema.Struct({
  emailChange: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Unknown),
});

const UserSettingsSearch = Schema.transform(
  RawUserSettingsSearch,
  Schema.Struct({
    emailChange: Schema.optional(
      Schema.Literal(EMAIL_CHANGE_COMPLETE, EMAIL_CHANGE_FAILED)
    ),
  }),
  {
    strict: true,
    decode: ({ emailChange, error }) => {
      if (typeof error === "string" && error.length > 0) {
        return { emailChange: EMAIL_CHANGE_FAILED };
      }

      return emailChange === EMAIL_CHANGE_COMPLETE
        ? { emailChange: EMAIL_CHANGE_COMPLETE }
        : {};
    },
    encode: (search) => search,
  }
);

export type UserSettingsSearch = typeof UserSettingsSearch.Type;
export type EmailChangeStatus = NonNullable<UserSettingsSearch["emailChange"]>;

export function decodeUserSettingsSearch(input: unknown): UserSettingsSearch {
  return ParseResult.decodeUnknownSync(UserSettingsSearch)(input);
}
