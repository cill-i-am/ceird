import { resolveApiOrigin } from "./api-origin";

export interface ServerApiForwardedHeaders {
  readonly origin: string;
  readonly "x-forwarded-host": string;
  readonly "x-forwarded-proto": "http" | "https";
}

const SECURE_AUTH_COOKIE_PREFIX = "__Secure-better-auth.";
const INSECURE_AUTH_COOKIE_PREFIX = "better-auth.";

function isInternalHttpApiOrigin(apiOrigin: string): boolean {
  try {
    const url = new URL(apiOrigin);

    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

function readCurrentRequestOrigin(input: {
  readonly forwardedHost: string | undefined;
  readonly host: string | undefined;
  readonly forwardedProto: string | undefined;
}): string | undefined {
  const trustsForwardedHost = isTrustedForwardingHost(input.host);
  const host = readTrustedRequestHost(input);

  if (!host) {
    return undefined;
  }

  const { forwardedProto } = input;
  const protocol =
    trustsForwardedHost &&
    (forwardedProto === "http" || forwardedProto === "https")
      ? forwardedProto
      : publicHostProtocol(host);

  return `${protocol}://${host}`;
}

export function readTrustedRequestHost(input: {
  readonly forwardedHost: string | undefined;
  readonly host: string | undefined;
}): string | undefined {
  return isTrustedForwardingHost(input.host) && input.forwardedHost
    ? input.forwardedHost
    : input.host;
}

function publicHostProtocol(host: string): "http" | "https" {
  return isLocalhostDomain(host) || isTrustedForwardingHost(host)
    ? "http"
    : "https";
}

function isTrustedForwardingHost(host: string | undefined): boolean {
  if (!host) {
    return false;
  }

  try {
    const url = new URL(`http://${host}`);
    return (
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "[::1]" ||
      url.hostname === "::1"
    );
  } catch {
    return false;
  }
}

function isLocalhostDomain(host: string): boolean {
  try {
    const url = new URL(`http://${host}`);
    return url.hostname === "localhost" || url.hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

function splitCookieEntry(entry: string):
  | {
      readonly name: string;
      readonly value: string;
    }
  | undefined {
  for (let index = 0; index < entry.length; index += 1) {
    if (entry[index] === "=") {
      return {
        name: entry.slice(0, index),
        value: entry.slice(index + 1),
      };
    }
  }

  return undefined;
}

export function readServerApiForwardedHeaders(input: {
  readonly origin: string | undefined;
  readonly forwardedHost: string | undefined;
  readonly host: string | undefined;
  readonly forwardedProto: string | undefined;
}): ServerApiForwardedHeaders | undefined {
  const requestOrigin = readCurrentRequestOrigin(input);

  if (!requestOrigin) {
    return undefined;
  }

  const publicApiOrigin = resolveApiOrigin(requestOrigin);

  if (!publicApiOrigin) {
    return undefined;
  }

  const url = new URL(publicApiOrigin);

  return {
    origin: input.origin ?? requestOrigin,
    "x-forwarded-host": url.host,
    "x-forwarded-proto": url.protocol === "https:" ? "https" : "http",
  };
}

export function normalizeServerApiCookieHeader(
  cookie: string,
  apiOrigin: string
): string {
  if (!isInternalHttpApiOrigin(apiOrigin)) {
    return cookie;
  }

  const entries: string[] = [];
  const names = new Set<string>();

  for (const part of cookie.split(";")) {
    const entry = part.trim();

    if (entry.length === 0) {
      continue;
    }

    entries.push(entry);
    names.add(splitCookieEntry(entry)?.name ?? entry);
  }
  const aliases: string[] = [];

  for (const entry of entries) {
    const parsedEntry = splitCookieEntry(entry);

    if (!parsedEntry) {
      continue;
    }

    const { name } = parsedEntry;

    if (!name.startsWith(SECURE_AUTH_COOKIE_PREFIX)) {
      continue;
    }

    const aliasName = `${INSECURE_AUTH_COOKIE_PREFIX}${name.slice(SECURE_AUTH_COOKIE_PREFIX.length)}`;

    if (names.has(aliasName)) {
      continue;
    }

    aliases.push(`${aliasName}=${parsedEntry.value}`);
  }

  return aliases.length > 0 ? [...entries, ...aliases].join("; ") : cookie;
}
