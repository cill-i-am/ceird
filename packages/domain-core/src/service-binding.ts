/// <reference types="@cloudflare/workers-types" />

export interface DomainServiceBinding {
  readonly fetch: Service["fetch"];
  readonly connect: Service["connect"];
}

export interface DomainHttpClient {
  readonly request: (request: Request) => Promise<Response>;
}

export function makeDomainServiceClient(
  binding: Pick<DomainServiceBinding, "fetch">
): DomainHttpClient {
  return {
    request: (request) => binding.fetch(makeDomainBoundaryRequest(request)),
  };
}

export function makeDomainOriginClient(
  origin: string,
  fetcher: typeof fetch = globalThis.fetch
): DomainHttpClient {
  const normalizedOrigin = origin.replace(/\/+$/, "");

  return {
    request: (request) => {
      const sourceUrl = new URL(request.url);
      const targetUrl = `${normalizedOrigin}${sourceUrl.pathname}${sourceUrl.search}`;

      return fetcher(makeDomainBoundaryRequest(request, targetUrl));
    },
  };
}

function makeDomainBoundaryRequest(request: Request, targetUrl = request.url) {
  const forwardedRequest =
    targetUrl === request.url ? request : new Request(targetUrl, request);

  return new Request(forwardedRequest, {
    headers: makeDomainBoundaryHeaders(request),
  });
}

function makeDomainBoundaryHeaders(request: Request) {
  const headers = new Headers(request.headers);

  const forwardedHeaderNames: string[] = [];

  for (const name of headers.keys()) {
    const lowerName = name.toLowerCase();

    if (lowerName === "forwarded" || lowerName.startsWith("x-forwarded-")) {
      forwardedHeaderNames.push(name);
    }
  }

  for (const name of forwardedHeaderNames) {
    headers.delete(name);
  }

  const url = new URL(request.url);
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(/:$/, ""));

  if (url.port.length > 0) {
    headers.set("x-forwarded-port", url.port);
  }

  const cloudflareConnectingIp = request.headers.get("cf-connecting-ip");

  if (cloudflareConnectingIp !== null && cloudflareConnectingIp.length > 0) {
    headers.set("x-forwarded-for", cloudflareConnectingIp);
  }

  return headers;
}
