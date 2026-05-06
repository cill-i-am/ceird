import { describe, expect, it } from "vitest";

import { isTransientMigrationConnectionError } from "./drizzle-migrations.ts";

describe("Drizzle migration retry classification", () => {
  it("recognizes PlanetScale connection slot exhaustion as transient", () => {
    expect(
      isTransientMigrationConnectionError(
        new Error(
          "remaining connection slots are reserved for roles with the SUPERUSER attribute"
        )
      )
    ).toBeTruthy();
  });

  it("does not retry unrelated migration failures", () => {
    expect(
      isTransientMigrationConnectionError(new Error("relation already exists"))
    ).toBeFalsy();
  });
});
