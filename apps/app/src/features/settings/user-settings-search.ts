const EMAIL_CHANGE_COMPLETE = "complete" as const;
const EMAIL_CHANGE_FAILED = "failed" as const;

export type EmailChangeStatus =
  | typeof EMAIL_CHANGE_COMPLETE
  | typeof EMAIL_CHANGE_FAILED;

export interface UserSettingsSearch {
  readonly emailChange?: EmailChangeStatus | undefined;
}

export function decodeUserSettingsSearch(input: unknown): UserSettingsSearch {
  const emailChange = readSearchParam(input, "emailChange");
  const error = readSearchParam(input, "error");

  if (error && error.length > 0) {
    return { emailChange: EMAIL_CHANGE_FAILED };
  }

  return emailChange === EMAIL_CHANGE_COMPLETE
    ? { emailChange: EMAIL_CHANGE_COMPLETE }
    : {};
}

function readSearchParam(input: unknown, key: string) {
  if (typeof input !== "object" || input === null) {
    return;
  }

  const value = (input as Record<string, unknown>)[key];

  return typeof value === "string" ? value : undefined;
}
