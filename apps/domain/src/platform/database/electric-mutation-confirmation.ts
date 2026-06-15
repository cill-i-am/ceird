import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { SqlError } from "effect/unstable/sql";

export interface ElectricMutationConfirmation {
  readonly txid: number;
}

export interface ElectricMutationConfirmed<Value> {
  readonly mutation: ElectricMutationConfirmation;
  readonly value: Value;
}

interface CurrentPostgresMutationTxidRow {
  readonly txid: string;
}

export function withElectricMutationConfirmation<
  Value,
  WriteError,
  Requirements,
>(
  effect: Effect.Effect<Value, WriteError, Requirements>
): Effect.Effect<
  ElectricMutationConfirmed<Value>,
  WriteError | SqlError.SqlError,
  Requirements | SqlClient.SqlClient
> {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const value = yield* effect;
        const mutation = yield* loadCurrentPostgresMutationConfirmation(sql);

        return {
          mutation,
          value,
        } satisfies ElectricMutationConfirmed<Value>;
      })
    );
  });
}

export function loadCurrentPostgresMutationConfirmation(
  sql: SqlClient.SqlClient
): Effect.Effect<ElectricMutationConfirmation, SqlError.SqlError> {
  return Effect.gen(function* () {
    const rows = yield* sql<CurrentPostgresMutationTxidRow>`
      select pg_current_xact_id()::xid::text as txid
    `;
    const [row] = rows;

    if (row === undefined) {
      return yield* Effect.die(
        new Error("Postgres did not return a current transaction id")
      );
    }

    return yield* Effect.sync(() => ({
      txid: decodePostgresElectricTxid(row.txid),
    }));
  });
}

export function decodePostgresElectricTxid(rawTxid: string): number {
  if (!/^\d+$/u.test(rawTxid)) {
    throw new Error(`Postgres transaction id is not numeric: ${rawTxid}`);
  }

  const txid = Number(rawTxid);

  if (!Number.isSafeInteger(txid) || txid < 0 || txid > 4_294_967_295) {
    throw new Error(
      `Postgres transaction id cannot be represented as an Electric txid: ${rawTxid}`
    );
  }

  return txid;
}
