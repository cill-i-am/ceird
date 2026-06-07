import { createFileRoute } from "@tanstack/react-router";

import { proxyLocalAppApiRequest } from "#/lib/local-api-proxy";

type ApiProxyHandlerInput = {
  readonly request: Request;
};

function proxyApiRequest({ request }: ApiProxyHandlerInput) {
  return proxyLocalAppApiRequest(request);
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      DELETE: proxyApiRequest,
      GET: proxyApiRequest,
      HEAD: proxyApiRequest,
      OPTIONS: proxyApiRequest,
      PATCH: proxyApiRequest,
      POST: proxyApiRequest,
      PUT: proxyApiRequest,
    },
  },
});
