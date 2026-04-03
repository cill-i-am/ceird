import { createServerFn } from "@tanstack/react-start";
import {
  getRequestHeader,
  getRequestHost,
  getRequestProtocol,
} from "@tanstack/react-start/server";

import {
  createTaskTrackerAuthClient,
  resolveAuthBaseURL,
} from "#/lib/auth-client";

export const getServerAuthSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const cookie = getRequestHeader("cookie");
    const authBaseURL = resolveAuthBaseURL(
      `${getRequestProtocol()}://${getRequestHost()}`
    );

    if (!cookie || !authBaseURL) {
      return null;
    }

    const authClient = createTaskTrackerAuthClient(authBaseURL);
    const session = await authClient.getSession({
      fetchOptions: {
        headers: {
          cookie,
        },
      },
    });

    return session.data?.session ?? null;
  }
);
