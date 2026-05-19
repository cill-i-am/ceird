import { Effect } from "effect";

import type { ApiWorkerEnv } from "./platform/cloudflare/env.js";
import { handleWorkerFetch } from "./platform/cloudflare/runtime.js";

const worker = {
  fetch(
    request: Request,
    env: ApiWorkerEnv,
    context: ExecutionContext
  ): Promise<Response> {
    return Effect.runPromise(handleWorkerFetch(request, env, context));
  },
} satisfies ExportedHandler<ApiWorkerEnv>;

export default worker;
