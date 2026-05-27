import { describe, expect, it } from "@effect/vitest";

import { formatStorageErrorCause } from "./storage-error-cause.js";

describe("storage error cause formatting", () => {
  it("includes nested Postgres details from Effect SQL errors", () => {
    const postgresCause = {
      code: "22P02",
      constraint: undefined,
      detail: 'Expected ":", but found "}".',
      message: "invalid input syntax for type json",
      routine: "json_errsave_error",
    };
    const sqlReason = new Error("Failed to execute statement", {
      cause: postgresCause,
    });
    const sqlError = new Error("Failed to execute statement", {
      cause: sqlReason,
    });
    sqlError.name = "SqlError";

    expect(formatStorageErrorCause(sqlError)).toBe(
      'SqlError: Failed to execute statement; Postgres 22P02: invalid input syntax for type json; detail: Expected ":", but found "}".; routine: json_errsave_error'
    );
  });

  it("redacts URL secret parameters in nested provider messages", () => {
    const sqlError = new Error("Failed to execute statement", {
      cause: {
        code: "23505",
        detail: "duplicate key value violates unique constraint",
        message:
          "https://example.test/insert?key=super-secret&token=also-secret",
      },
    });

    expect(formatStorageErrorCause(sqlError)).not.toContain("super-secret");
    expect(formatStorageErrorCause(sqlError)).not.toContain("also-secret");
  });
});
