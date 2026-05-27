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

  const mutableResponse = makeResponseHeadersMutable(response);

  for (const [key, value] of corsHeaders) {
    mutableResponse.headers.set(key, value);
  }

  return mutableResponse;
}

function makeResponseHeadersMutable(response: Response): Response {
  const testHeader = "x-ceird-agent-header-mutability-check";

  try {
    response.headers.set(testHeader, "1");
    response.headers.delete(testHeader);

    return response;
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }
  }

  return new Response(response.body, {
    cf: response.cf,
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
    webSocket: response.webSocket,
  });
}

function makeCorsHeaders(
  request: Request,
  env: AgentWorkerEnv,
  options: { readonly preflight?: boolean } = {}
): Headers | undefined {
  const origin = request.headers.get("origin");

  if (
    origin === null ||
    !matchesTrustedOrigin(origin, getTrustedOrigins(env))
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

function getTrustedOrigins(env: AgentWorkerEnv): readonly string[] {
  const origins = new Set<string>();

  for (const origin of (env.AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)) {
    origins.add(origin);
  }

  if (env.AUTH_APP_ORIGIN !== undefined) {
    origins.add(env.AUTH_APP_ORIGIN);
  }

  return [...origins];
}

function matchesTrustedOrigin(
  origin: string,
  trustedOrigins: readonly string[]
) {
  return trustedOrigins.some((pattern) => {
    if (!pattern.includes("*") && !pattern.includes("?")) {
      return pattern === origin;
    }

    const escapedPattern = pattern.replaceAll(/[.+^${}()|[\]\\]/g, "\\$&");
    const matcher = escapedPattern
      .replaceAll("*", "[^.]+")
      .replaceAll("?", "[^.]");

    return new RegExp(`^${matcher}$`).test(origin);
  });
}
