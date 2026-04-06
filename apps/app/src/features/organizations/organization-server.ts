import { createServerOnlyFn } from "@tanstack/react-start";
import {
  getRequestHeader,
  getRequestHost,
  getRequestProtocol,
} from "@tanstack/react-start/server";

import { resolveAuthBaseURL } from "#/lib/auth-client";
import type { createTaskTrackerAuthClient } from "#/lib/auth-client";

type ServerOrganization = NonNullable<
  Awaited<
    ReturnType<
      ReturnType<typeof createTaskTrackerAuthClient>["organization"]["list"]
    >
  >["data"]
>[number];

export const getCurrentServerOrganizations = createServerOnlyFn(async () => {
  const cookie = getRequestHeader("cookie");
  const serverAuthOrigin = readServerAuthOrigin();
  const authBaseURL = resolveAuthBaseURL(
    `${getRequestProtocol()}://${getRequestHost()}`,
    serverAuthOrigin
  );

  if (!cookie) {
    throw new Error(
      "Cannot list organizations without the current auth cookie."
    );
  }

  if (!authBaseURL) {
    throw new Error(
      "Cannot resolve the auth base URL for organization lookup."
    );
  }

  const response = await fetch(
    new URL("organization/list", `${authBaseURL}/`),
    {
      headers: {
        accept: "application/json",
        cookie,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Organization lookup failed with status ${response.status}.`
    );
  }

  const organizations = (await response.json()) as ServerOrganization[] | null;

  if (!organizations) {
    throw new Error("Organization lookup returned no data.");
  }

  return organizations;
});

function readServerAuthOrigin(): string | undefined {
  if (typeof __SERVER_AUTH_ORIGIN__ === "string") {
    return __SERVER_AUTH_ORIGIN__;
  }

  const authOrigin = process.env.AUTH_ORIGIN;
  return typeof authOrigin === "string" ? authOrigin : undefined;
}
