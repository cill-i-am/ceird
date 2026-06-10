import { readConfiguredServerApiOrigin } from "./api-origin.server";
import { isLocalAppBrowserOrigin } from "./app-service-origin";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const LOCAL_PROXY_CLIENT_IP = "127.0.0.1";

export function canProxyLocalAppApiRequest(requestUrl: URL) {
  return isLocalAppBrowserOrigin(requestUrl);
}

function readHeaderHostUrl(host: string | null) {
  if (!host) {
    return;
  }

  try {
    return new URL(`http://${host}`);
  } catch {
    // Invalid forwarded hosts cannot be used to infer the public origin.
  }
}

function readPublicRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");

  if (origin) {
    return origin;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol =
    forwardedProto === "https" || forwardedProto === "http"
      ? `${forwardedProto}:`
      : requestUrl.protocol;
  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const host = forwardedHost ?? requestUrl.host;

  return `${protocol}//${host}`;
}

function canProxyLocalAppApiRequestFromRequest(request: Request) {
  const requestUrl = new URL(request.url);

  if (canProxyLocalAppApiRequest(requestUrl)) {
    return true;
  }

  const hostUrl = readHeaderHostUrl(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  );

  return hostUrl === undefined ? false : canProxyLocalAppApiRequest(hostUrl);
}

function stripHopByHopHeaders(headers: Headers) {
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }
}

function resolveProxyTargetUrl(requestUrl: URL, apiOrigin: string) {
  const targetUrl = new URL(requestUrl.toString());
  const apiUrl = new URL(apiOrigin);

  targetUrl.protocol = apiUrl.protocol;
  targetUrl.hostname = apiUrl.hostname;
  targetUrl.port = apiUrl.port;
  targetUrl.username = "";
  targetUrl.password = "";
  targetUrl.pathname = resolveProxyTargetPath(requestUrl.pathname);

  return targetUrl;
}

function resolveProxyTargetPath(pathname: string) {
  if (
    pathname === "/api/auth" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/public" ||
    pathname.startsWith("/api/public/")
  ) {
    return pathname;
  }

  if (pathname === "/api") {
    return "/";
  }

  if (pathname.startsWith("/api/")) {
    return pathname.slice("/api".length);
  }

  return pathname;
}

function makeProxyHeaders(request: Request, targetUrl: URL) {
  const headers = new Headers(request.headers);
  stripHopByHopHeaders(headers);
  headers.set("origin", readPublicRequestOrigin(request));
  headers.set("x-forwarded-host", targetUrl.host);
  headers.set(
    "x-forwarded-proto",
    targetUrl.protocol === "https:" ? "https" : "http"
  );

  if (!headers.has("cf-connecting-ip") && !headers.has("x-forwarded-for")) {
    headers.set("cf-connecting-ip", LOCAL_PROXY_CLIENT_IP);
    headers.set("x-forwarded-for", LOCAL_PROXY_CLIENT_IP);
  }

  return headers;
}

function makeProxyRequest(request: Request, targetUrl: URL) {
  const method = request.method.toUpperCase();

  const init: RequestInit & { readonly duplex?: "half" } = {
    body: method === "GET" || method === "HEAD" ? undefined : request.body,
    duplex: "half",
    headers: makeProxyHeaders(request, targetUrl),
    method,
    redirect: "manual",
  };

  return new Request(targetUrl, init);
}

export async function proxyLocalAppApiRequest(
  request: Request,
  options: {
    readonly apiOrigin?: string | undefined;
    readonly fetch?: typeof globalThis.fetch | undefined;
  } = {}
) {
  const requestUrl = new URL(request.url);

  if (!canProxyLocalAppApiRequestFromRequest(request)) {
    return new Response(
      "Local API proxy is only available on stage-scoped local app hosts.",
      {
        status: 404,
      }
    );
  }

  const apiOrigin = options.apiOrigin ?? readConfiguredServerApiOrigin();

  if (!apiOrigin) {
    return new Response("Cannot resolve the local API origin.", {
      status: 502,
    });
  }

  const targetUrl = resolveProxyTargetUrl(requestUrl, apiOrigin);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const response = await fetchImpl(makeProxyRequest(request, targetUrl));

  return new Response(response.body, response);
}
