import { createServerOnlyFn } from "@tanstack/react-start";
import {
  getRequestHeader,
  getRequestHost,
  getRequestProtocol,
} from "@tanstack/react-start/server";

import { resolveAuthBaseURL } from "#/lib/auth-client";
import type { createTaskTrackerAuthClient } from "#/lib/auth-client";
import { readConfiguredServerAuthOrigin } from "#/lib/server-auth-origin";

type ServerAuthSession = Awaited<
  ReturnType<ReturnType<typeof createTaskTrackerAuthClient>["getSession"]>
>["data"];

export const getCurrentServerSession = createServerOnlyFn(async () => {
  const cookie = getRequestHeader("cookie");
  const serverAuthOrigin = readConfiguredServerAuthOrigin();
  const authBaseURL = resolveAuthBaseURL(
    `${getRequestProtocol()}://${getRequestHost()}`,
    serverAuthOrigin
  );

  if (!cookie || !authBaseURL) {
    return null;
  }

  const response = await fetch(new URL("get-session", `${authBaseURL}/`), {
    headers: {
      accept: "application/json",
      cookie,
    },
  });

  if (!response.ok) {
    return null;
  }

  return ((await response.json()) as ServerAuthSession | null) ?? null;
});
