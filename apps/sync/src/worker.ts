import { Effect } from "effect";

import { ElectricSql } from "./platform/cloudflare/electric-sql-do.js";
import type { SyncWorkerEnv } from "./platform/cloudflare/env.js";
import { handleSyncWorkerFetch } from "./platform/cloudflare/runtime.js";

export { ElectricSql };

export default {
  fetch(request: Request, env: SyncWorkerEnv, context: ExecutionContext) {
    return Effect.runPromise(handleSyncWorkerFetch(request, env, context));
  },
};
