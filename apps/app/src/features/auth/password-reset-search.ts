const INVALID_TOKEN = "INVALID_TOKEN" as const;

export interface PasswordResetSearch {
  readonly invitation?: string | undefined;
  readonly token?: string | undefined;
  readonly error?: typeof INVALID_TOKEN | undefined;
}

export function decodePasswordResetSearch(input: unknown): PasswordResetSearch {
  const error = readSearchParam(input, "error");
  const invitation = readSearchParam(input, "invitation");
  const token = readSearchParam(input, "token");
  const invitationSearch =
    invitation && invitation.length > 0 ? { invitation } : {};

  if (error === INVALID_TOKEN) {
    return { ...invitationSearch, error: INVALID_TOKEN };
  }

  return token && token.length > 0
    ? { ...invitationSearch, token }
    : invitationSearch;
}

function readSearchParam(input: unknown, key: string) {
  if (typeof input !== "object" || input === null) {
    return;
  }

  const value = (input as Record<string, unknown>)[key];

  return typeof value === "string" ? value : undefined;
}
