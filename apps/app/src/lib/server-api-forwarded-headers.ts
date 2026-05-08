import { resolveApiOrigin } from "./api-origin";

export interface ServerApiForwardedHeaders {
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
  readonly host: string | undefined;
  readonly forwardedProto: string | undefined;
}): string | undefined {
  const { host } = input;

  if (!host) {
    return undefined;
  }

  const { forwardedProto } = input;
  let protocol: "http" | "https" = "http";

  if (forwardedProto === "http" || forwardedProto === "https") {
    protocol = forwardedProto;
  } else if (host.includes("ceird.localhost")) {
    protocol = "https";
  }

  return `${protocol}://${host}`;
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
  readonly host: string | undefined;
  readonly forwardedProto: string | undefined;
}): ServerApiForwardedHeaders | undefined {
  const requestOrigin = readCurrentRequestOrigin(input);
  const publicApiOrigin = requestOrigin
    ? resolveApiOrigin(requestOrigin)
    : undefined;

  if (!publicApiOrigin) {
    return undefined;
  }

  const url = new URL(publicApiOrigin);

  return {
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
