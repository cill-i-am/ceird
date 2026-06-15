import { afterAll, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

import {
  makeAppDatabaseLive,
  makeAppEffectSqlRuntimeLive,
} from "./database.js";
import {
  decodePostgresElectricTxid,
  loadCurrentPostgresMutationConfirmation,
  withElectricMutationConfirmation,
} from "./electric-mutation-confirmation.js";
import { canConnect, createTestDatabase, withPool } from "./test-database.js";

describe("Electric mutation confirmation", () => {
  const cleanup: (() => Promise<void>)[] = [];

  afterAll(async () => {
    await Promise.all([...cleanup].toReversed().map((step) => step()));
  });

  it("decodes Postgres xid text into Electric txid numbers", () => {
    expect(decodePostgresElectricTxid("42")).toBe(42);
    expect(decodePostgresElectricTxid("4294967295")).toBe(4_294_967_295);

    expect(() => decodePostgresElectricTxid("42.5")).toThrow(/not numeric/);
    expect(() => decodePostgresElectricTxid("4294967296")).toThrow(
      /cannot be represented/
    );
  });

  it("reads confirmation metadata inside the same Postgres transaction", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "electric_mutation_confirmation",
    });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Postgres integration database unavailable; skipping Electric txid source coverage"
      );
    }

    const runtime = makeAppEffectSqlRuntimeLive(
      makeAppDatabaseLive(testDatabase.url)
    );
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          return yield* withElectricMutationConfirmation(
            Effect.gen(function* () {
              const sql = yield* SqlClient.SqlClient;
              const mutation =
                yield* loadCurrentPostgresMutationConfirmation(sql);

              return mutation.txid;
            })
          );
        }).pipe(Effect.provide(runtime))
      )
    );

    expect(Number.isInteger(result.mutation.txid)).toBeTruthy();
    expect(result.mutation.txid).toBeGreaterThanOrEqual(0);
    expect(result.value).toBe(result.mutation.txid);
  });
});
