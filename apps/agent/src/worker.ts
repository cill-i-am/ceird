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

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: makeCorsHeaders(request, env, { preflight: true }),
        status: 204,
      });
    }

    let authorized;

    try {
      authorized = await authorizeAgentRequest(request, env);
    } catch (error) {
      if (error instanceof AgentRequestUnauthorizedError) {
        return withCorsHeaders(
          new Response("Agent request unauthorized", { status: 401 }),
          request,
          env
        );
      }

      throw error;
    }

    try {
      const response =
        (await routeAgentRequest(authorized.request, env)) ??
        new Response("Not found", { status: 404 });

      return withCorsHeaders(response, request, env);
    } catch (error) {
      console.error("Agent route failed", {
        cause: error instanceof Error ? error.name : typeof error,
        path: new URL(authorized.request.url).pathname,
      });

      return withCorsHeaders(
        new Response("Agent route failed", { status: 500 }),
        request,
        env
      );
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

function withCorsHeaders(
  response: Response,
  request: Request,
  env: AgentWorkerEnv
): Response {
  const corsHeaders = makeCorsHeaders(request, env);

  if (corsHeaders === undefined) {
    return response;
  }

  for (const [key, value] of corsHeaders) {
    response.headers.set(key, value);
  }

  return response;
}

function makeCorsHeaders(
  request: Request,
  env: AgentWorkerEnv,
  options: { readonly preflight?: boolean } = {}
): Headers | undefined {
  const origin = request.headers.get("origin");

  if (
    origin === null ||
    env.AUTH_APP_ORIGIN === undefined ||
    origin !== env.AUTH_APP_ORIGIN
  ) {
    return undefined;
  }

  const headers = new Headers({
    "access-control-allow-credentials": "true",
    "access-control-allow-origin": origin,
    vary: "Origin",
  });

  if (options.preflight === true) {
    headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    headers.set(
      "access-control-allow-headers",
      request.headers.get("access-control-request-headers") ??
        "authorization, content-type"
    );
    headers.set("vary", "Origin, Access-Control-Request-Headers");
  }

  return headers;
}
