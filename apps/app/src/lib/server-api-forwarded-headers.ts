import { getRequestHeader } from "@tanstack/react-start/server";

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

function readCurrentRequestOrigin(): string | undefined {
  const host = getRequestHeader("host");

  if (!host) {
    return undefined;
  }

  const forwardedProto = getRequestHeader("x-forwarded-proto");
  let protocol: "http" | "https" = "http";

  if (forwardedProto === "http" || forwardedProto === "https") {
    protocol = forwardedProto;
  } else if (host.includes("task-tracker.localhost")) {
    protocol = "https";
  }

  return `${protocol}://${host}`;
}

export function readServerApiForwardedHeaders():
  | ServerApiForwardedHeaders
  | undefined {
  const requestOrigin = readCurrentRequestOrigin();
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

  const entries = cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const names = new Set(entries.map((entry) => entry.split("=", 1)[0] ?? ""));
  const aliases: string[] = [];

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name = entry.slice(0, separatorIndex);

    if (!name.startsWith(SECURE_AUTH_COOKIE_PREFIX)) {
      continue;
    }

    const aliasName = `${INSECURE_AUTH_COOKIE_PREFIX}${name.slice(SECURE_AUTH_COOKIE_PREFIX.length)}`;

    if (names.has(aliasName)) {
      continue;
    }

    aliases.push(`${aliasName}=${entry.slice(separatorIndex + 1)}`);
  }

  return aliases.length > 0 ? [...entries, ...aliases].join("; ") : cookie;
}
