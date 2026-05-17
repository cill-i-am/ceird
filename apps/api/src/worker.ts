import { Effect } from "effect";

import type { ApiWorkerEnv } from "./platform/cloudflare/env.js";
import {
  handleWorkerFetch,
  handleWorkerQueue,
} from "./platform/cloudflare/runtime.js";

const worker = {
  fetch(
    request: Request,
    env: ApiWorkerEnv,
    context: ExecutionContext
  ): Promise<Response> {
    return Effect.runPromise(handleWorkerFetch(request, env, context));
  },

  queue(batch: MessageBatch<unknown>, env: ApiWorkerEnv): Promise<void> {
    return Effect.runPromise(handleWorkerQueue(batch, env));
  },
} satisfies ExportedHandler<ApiWorkerEnv, unknown>;

export default worker;
