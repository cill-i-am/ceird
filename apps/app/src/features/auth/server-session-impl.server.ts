import { resolveConfiguredServerAuthBaseURL } from "#/lib/auth-client.server";
import {
  normalizeServerApiCookieHeader,
  readServerApiForwardedHeaders,
} from "#/lib/server-api-forwarded-headers";

import { decodeServerAuthSession } from "./app-context-types";
import { readGlobalAppServerContext } from "./app-server-context";
import type { ServerAuthSession } from "./server-session-types";

export async function getCurrentServerSessionDirect() {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const cachedSession = readGlobalAppServerContext().authSession;

  if (cachedSession !== undefined) {
    return cachedSession;
  }

  return await readOptionalServerAuthSessionFromHeaders((name) =>
    getRequestHeader(name)
  );
}

export async function readOptionalServerAuthSessionFromRequest(
  request: Request
) {
  return await readOptionalServerAuthSessionFromHeaders(
    (name) => request.headers.get(name) ?? undefined
  );
}

async function readOptionalServerAuthSessionFromHeaders(
  getRequestHeader: (name: string) => string | undefined
) {
  const cookie = getRequestHeader("cookie");
  const authBaseURL = resolveConfiguredServerAuthBaseURL();
  const forwardedHeaders = readServerApiForwardedHeaders({
    forwardedHost: getRequestHeader("x-forwarded-host"),
    host: getRequestHeader("host"),
    origin: getRequestHeader("origin"),
    forwardedProto: getRequestHeader("x-forwarded-proto"),
  });

  if (!cookie || !authBaseURL) {
    return null;
  }

  const normalizedCookie = normalizeServerApiCookieHeader(cookie, authBaseURL);

  const response = await fetch(new URL("get-session", `${authBaseURL}/`), {
    headers: {
      accept: "application/json",
      cookie: normalizedCookie,
      ...forwardedHeaders,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;

  if (payload === null) {
    return null;
  }

  return decodeOptionalServerAuthSession(payload);
}

function decodeOptionalServerAuthSession(
  payload: unknown
): ServerAuthSession | null {
  try {
    return decodeServerAuthSession(payload);
  } catch {
    return null;
  }
}
