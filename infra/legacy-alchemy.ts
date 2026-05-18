import * as Provider from "alchemy/Provider";
import type { Resource as ResourceShape } from "alchemy/Resource";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";

type LegacyDrizzleMigrations = ResourceShape<
  "Drizzle.Migrations",
  Record<string, unknown>,
  Record<string, unknown>
>;

const LegacyDrizzleMigrations =
  Resource<LegacyDrizzleMigrations>("Drizzle.Migrations");

export const legacyDrizzleMigrationsProvider = Provider.succeed(
  LegacyDrizzleMigrations,
  {
    read: Effect.fn(function ({ output }) {
      return Effect.succeed(output);
    }),
    reconcile: Effect.fn(function ({ output }) {
      return Effect.succeed(output ?? {});
    }),
    delete: Effect.fn(function () {
      // Tombstone provider only: old Drizzle.Migrations state has no live
      // resource to clean up now that Neon.Branch applies SQL natively.
      return Effect.void;
    }),
  }
);
