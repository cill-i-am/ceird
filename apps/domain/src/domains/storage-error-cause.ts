const SECRET_ASSIGNMENT_PATTERN =
  /([?&]?(?:key|token|secret|password|authorization|credential)=)[^&\s]+/gi;

const MAX_CAUSE_LENGTH = 1_000;

export function formatStorageErrorCause(error: unknown): string {
  const parts = uniqueNonEmpty([
    formatTopLevelError(error),
    formatPostgresCause(findPostgresCause(error)),
  ]);
  const formatted = parts.length > 0 ? parts.join("; ") : String(error);

  return truncateCause(sanitizeCause(formatted));
}

function formatTopLevelError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return typeof error === "string" ? error : undefined;
}

function formatPostgresCause(cause: Record<string, unknown> | undefined) {
  if (cause === undefined) {
    return undefined;
  }

  const code = stringField(cause, "code");
  const message = stringField(cause, "message");
  const detail = stringField(cause, "detail");
  const constraint = stringField(cause, "constraint");
  const routine = stringField(cause, "routine");
  const fields = [
    code === undefined && message === undefined
      ? undefined
      : `Postgres${code === undefined ? "" : ` ${code}`}${message === undefined ? "" : `: ${message}`}`,
    detail === undefined ? undefined : `detail: ${detail}`,
    constraint === undefined ? undefined : `constraint: ${constraint}`,
    routine === undefined ? undefined : `routine: ${routine}`,
  ];

  return uniqueNonEmpty(fields).join("; ");
}

function findPostgresCause(
  error: unknown
): Record<string, unknown> | undefined {
  const visited = new Set<object>();
  const queue: unknown[] = [error];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!isRecord(current) || visited.has(current)) {
      continue;
    }

    visited.add(current);

    if (
      typeof current.code === "string" &&
      (typeof current.message === "string" ||
        typeof current.detail === "string" ||
        typeof current.constraint === "string")
    ) {
      return current;
    }

    queue.push(...nestedCauseValues(current));
  }

  return undefined;
}

function nestedCauseValues(value: object) {
  return [
    ...(isRecord(value) && "cause" in value ? [value.cause] : []),
    ...Object.getOwnPropertySymbols(value)
      .filter((symbol) => symbol.description === "cause")
      .map((symbol) => (value as Record<symbol, unknown>)[symbol]),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(source: Record<string, unknown>, key: string) {
  const value = source[key];

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function uniqueNonEmpty(values: readonly (string | undefined)[]) {
  return [...new Set(values.filter((value) => value !== undefined))];
}

function sanitizeCause(value: string) {
  return value.replaceAll(SECRET_ASSIGNMENT_PATTERN, "$1[redacted]");
}

function truncateCause(value: string) {
  return value.length <= MAX_CAUSE_LENGTH
    ? value
    : `${value.slice(0, MAX_CAUSE_LENGTH - 1)}…`;
}
