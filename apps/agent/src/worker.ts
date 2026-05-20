import { routeAgentRequest } from "agents";

import {
  AgentRequestUnauthorizedError,
  authorizeAgentRequest,
} from "./instance.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";

export { CeirdAgent } from "./ceird-agent.js";

const worker = {
  async fetch(request: Request, env: AgentWorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (!isAgentRoutePath(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }

    let authorized;

    try {
      authorized = await authorizeAgentRequest(request, env);
    } catch (error) {
      if (error instanceof AgentRequestUnauthorizedError) {
        return new Response("Agent request unauthorized", { status: 401 });
      }

      throw error;
    }

    try {
      return (
        (await routeAgentRequest(authorized.request, env)) ??
        new Response("Not found", { status: 404 })
      );
    } catch (error) {
      console.error("Agent route failed", {
        cause: error instanceof Error ? error.name : typeof error,
        path: new URL(authorized.request.url).pathname,
      });

      return new Response("Agent route failed", { status: 500 });
    }
  },
} satisfies ExportedHandler<AgentWorkerEnv>;

export default worker;

function isAgentRoutePath(pathname: string): boolean {
  return (
    pathname.startsWith("/agents/ceird-agent/") ||
    pathname.startsWith("/agents/CeirdAgent/")
  );
}
