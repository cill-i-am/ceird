import { Config, Effect } from "effect";

import { DomainWorkerDatabaseConfigurationError } from "../cloudflare/database-configuration-error.js";
import type { DomainWorkerEnv } from "../cloudflare/env.js";
import { DEFAULT_APP_DATABASE_URL } from "./config.js";

export const nodeDatabaseUrl = Config.string("DATABASE_URL").pipe(
  Config.withDefault(DEFAULT_APP_DATABASE_URL)
);

export function workerDatabaseUrl(
  env: Pick<DomainWorkerEnv, "CEIRD_LOCAL_DEV" | "DATABASE" | "DATABASE_URL">
) {
  const databaseUrl = env.DATABASE?.connectionString ?? env.DATABASE_URL;

  return databaseUrl === undefined
    ? Effect.fail(
        new DomainWorkerDatabaseConfigurationError({
          localDev: env.CEIRD_LOCAL_DEV === "true",
          message:
            "Domain Worker requires a DATABASE Hyperdrive binding or DATABASE_URL.",
        })
      )
    : Effect.succeed(databaseUrl);
}
