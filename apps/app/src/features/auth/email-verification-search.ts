const SUCCESS_STATUS = { status: "success" } as const;
const INVALID_TOKEN_STATUS = { status: "invalid-token" } as const;

export type EmailVerificationSearch =
  | typeof SUCCESS_STATUS
  | typeof INVALID_TOKEN_STATUS;

export function decodeEmailVerificationSearch(
  input: unknown
): EmailVerificationSearch {
  const error = readSearchParam(input, "error");
  const status = readSearchParam(input, "status");

  if (error) {
    return INVALID_TOKEN_STATUS;
  }

  if (status === "success") {
    return SUCCESS_STATUS;
  }

  return INVALID_TOKEN_STATUS;
}

function readSearchParam(input: unknown, key: string) {
  if (typeof input !== "object" || input === null) {
    return;
  }

  const value = (input as Record<string, unknown>)[key];

  return typeof value === "string" ? value : undefined;
}
