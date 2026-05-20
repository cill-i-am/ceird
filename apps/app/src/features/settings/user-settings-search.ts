import { Schema } from "effect";

const EMAIL_CHANGE_COMPLETE = "complete" as const;
const EMAIL_CHANGE_FAILED = "failed" as const;

const RawUserSettingsSearch = Schema.Struct({
  emailChange: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Unknown),
});

const UserSettingsSearch = Schema.Struct({
  emailChange: Schema.optional(
    Schema.Literals([EMAIL_CHANGE_COMPLETE, EMAIL_CHANGE_FAILED])
  ),
});

export type UserSettingsSearch = typeof UserSettingsSearch.Type;
export type EmailChangeStatus = NonNullable<UserSettingsSearch["emailChange"]>;

export function decodeUserSettingsSearch(input: unknown): UserSettingsSearch {
  const { emailChange, error } = Schema.decodeUnknownSync(
    RawUserSettingsSearch
  )(input);

  if (typeof error === "string" && error.length > 0) {
    return { emailChange: EMAIL_CHANGE_FAILED };
  }

  return emailChange === EMAIL_CHANGE_COMPLETE
    ? { emailChange: EMAIL_CHANGE_COMPLETE }
    : {};
}
