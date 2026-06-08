import { Effect } from "effect";

import type { DomainWorkerEnv } from "./platform/cloudflare/env.js";
import {
  handleWorkerFetch,
  handleWorkerQueue,
  handleWorkerScheduled,
} from "./platform/cloudflare/runtime.js";

const worker = {
  fetch(
    request: Request,
    env: DomainWorkerEnv,
    context: ExecutionContext
  ): Promise<Response> {
    return Effect.runPromise(handleWorkerFetch(request, env, context));
  },

  queue(batch: MessageBatch<unknown>, env: DomainWorkerEnv): Promise<void> {
    return Effect.runPromise(handleWorkerQueue(batch, env));
  },

  scheduled(
    controller: ScheduledController,
    env: DomainWorkerEnv
  ): Promise<void> {
    return Effect.runPromise(handleWorkerScheduled(controller, env));
  },
} satisfies ExportedHandler<DomainWorkerEnv, unknown>;

export default worker;
