import { Effect } from "effect";

import type { McpWorkerEnv } from "./platform/cloudflare/env.js";
import { handleMcpWorkerFetch } from "./platform/cloudflare/runtime.js";

const worker = {
  fetch(
    request: Request,
    env: McpWorkerEnv,
    context: ExecutionContext
  ): Promise<Response> {
    return Effect.runPromise(handleMcpWorkerFetch(request, env, context));
  },
} satisfies ExportedHandler<McpWorkerEnv>;

export default worker;
