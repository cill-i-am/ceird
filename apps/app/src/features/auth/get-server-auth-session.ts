import { createServerFn } from "@tanstack/react-start";
import {
  getRequestHeader,
  getRequestHost,
  getRequestProtocol,
} from "@tanstack/react-start/server";

import { resolveAuthBaseURL } from "#/lib/auth-client";
import type { createTaskTrackerAuthClient } from "#/lib/auth-client";

type ServerAuthSession = Awaited<
  ReturnType<ReturnType<typeof createTaskTrackerAuthClient>["getSession"]>
>["data"];

export const getServerAuthSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const cookie = getRequestHeader("cookie");
    const serverAuthOrigin = readServerAuthOrigin();
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
  }
);

function readServerAuthOrigin(): string | undefined {
  const processEnvironment = (
    globalThis as typeof globalThis & {
      process?: {
        env?: Record<string, string | undefined>;
      };
    }
  ).process?.env;

  const authOrigin = processEnvironment?.AUTH_ORIGIN;
  return typeof authOrigin === "string" ? authOrigin : undefined;
}
