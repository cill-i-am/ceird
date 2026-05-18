import { Config, Effect } from "effect";

import { DEFAULT_APP_DATABASE_URL } from "./config.js";

export interface DatabaseConnectionStringBinding {
  readonly DATABASE: {
    readonly connectionString: string;
  };
}

export const nodeDatabaseUrl = Config.string("DATABASE_URL").pipe(
  Config.withDefault(DEFAULT_APP_DATABASE_URL)
);

export function workerDatabaseUrl(env: DatabaseConnectionStringBinding) {
  return Effect.succeed(env.DATABASE.connectionString);
}
