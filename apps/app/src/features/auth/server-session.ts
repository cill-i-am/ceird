import { createServerOnlyFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { resolveConfiguredServerAuthBaseURL } from "#/lib/auth-client";
import type { createTaskTrackerAuthClient } from "#/lib/auth-client";
import {
  normalizeServerApiCookieHeader,
  readServerApiForwardedHeaders,
} from "#/lib/server-api-forwarded-headers";

type ServerAuthSession = Awaited<
  ReturnType<ReturnType<typeof createTaskTrackerAuthClient>["getSession"]>
>["data"];

export const getCurrentServerSession = createServerOnlyFn(async () => {
  const cookie = getRequestHeader("cookie");
  const authBaseURL = resolveConfiguredServerAuthBaseURL();
  const forwardedHeaders = readServerApiForwardedHeaders();

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

  return ((await response.json()) as ServerAuthSession | null) ?? null;
});
