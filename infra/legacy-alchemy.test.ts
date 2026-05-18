import { describe, expect, it } from "@effect/vitest";
import { findProviderByType } from "alchemy/Provider";
import * as Effect from "effect/Effect";

import { legacyDrizzleMigrationsProvider } from "./legacy-alchemy.ts";

describe("legacy Alchemy state providers", () => {
  it("keeps a tombstone provider for legacy Drizzle.Migrations state", async () => {
    const provider = await Effect.runPromise(
      findProviderByType("Drizzle.Migrations").pipe(
        Effect.provide(legacyDrizzleMigrationsProvider)
      )
    );

    expect(provider.delete).toEqual(expect.any(Function));
  });
});
