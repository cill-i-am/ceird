import { Effect } from "effect";

import type { McpWorkerEnv } from "./platform/cloudflare/env.js";
import { handleMcpWorkerFetch } from "./platform/cloudflare/runtime.js";

const worker = {
  fetch(request: Request, env: McpWorkerEnv): Promise<Response> {
    return Effect.runPromise(handleMcpWorkerFetch(request, env));
  },
} satisfies ExportedHandler<McpWorkerEnv>;

export default worker;
