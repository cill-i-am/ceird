import { Config, Effect } from "effect";

import type { ApiWorkerEnv } from "../cloudflare/env.js";
import { DEFAULT_APP_DATABASE_URL } from "./config.js";

export const nodeDatabaseUrl = Config.string("DATABASE_URL").pipe(
  Config.withDefault(DEFAULT_APP_DATABASE_URL)
);

export function workerDatabaseUrl(env: Pick<ApiWorkerEnv, "DATABASE">) {
  return Effect.succeed(env.DATABASE.connectionString);
}
