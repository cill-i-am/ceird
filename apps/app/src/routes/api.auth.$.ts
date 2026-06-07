import { createFileRoute } from "@tanstack/react-router";

import { readConfiguredServerApiOrigin } from "#/lib/api-origin.server";
import { readServerApiForwardedHeaders } from "#/lib/server-api-forwarded-headers";

interface AuthProxyHandlerInput {
  readonly request: Request;
}

const bodylessMethods = new Set(["GET", "HEAD"]);

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      DELETE: handleAuthProxyRequest,
      GET: handleAuthProxyRequest,
      HEAD: handleAuthProxyRequest,
      OPTIONS: handleAuthProxyRequest,
      PATCH: handleAuthProxyRequest,
      POST: handleAuthProxyRequest,
      PUT: handleAuthProxyRequest,
    },
  },
});

async function handleAuthProxyRequest({ request }: AuthProxyHandlerInput) {
  const apiOrigin = readConfiguredServerApiOrigin();

  if (!apiOrigin) {
    return Response.json({ error: "api_origin_unavailable" }, { status: 503 });
  }

  const apiUrl = new URL(apiOrigin);
  const targetUrl = new URL(request.url);

  targetUrl.protocol = apiUrl.protocol;
  targetUrl.host = apiUrl.host;
  targetUrl.username = "";
  targetUrl.password = "";

  const headers = makeProxyHeaders(request);
  const init: RequestInit = {
    headers,
    method: request.method,
    redirect: "manual",
  };

  if (!bodylessMethods.has(request.method)) {
    init.body = request.body;
  }

  return await fetch(new Request(targetUrl, init));
}

function makeProxyHeaders(request: Request) {
  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.delete("content-length");

  const forwardedHeaders = readServerApiForwardedHeaders({
    forwardedHost: request.headers.get("x-forwarded-host") ?? undefined,
    forwardedProto: request.headers.get("x-forwarded-proto") ?? undefined,
    host: request.headers.get("host") ?? undefined,
    origin: request.headers.get("origin") ?? new URL(request.url).origin,
  });

  if (forwardedHeaders) {
    headers.set("origin", forwardedHeaders.origin);
    headers.set("x-forwarded-host", forwardedHeaders["x-forwarded-host"]);
    headers.set("x-forwarded-proto", forwardedHeaders["x-forwarded-proto"]);
  }

  return headers;
}
