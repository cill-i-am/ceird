import { createServerOnlyFn } from "@tanstack/react-start";
import {
  getRequestHeader,
  getRequestHost,
  getRequestProtocol,
} from "@tanstack/react-start/server";
import { Schema } from "effect";

import { resolveAuthBaseURL } from "#/lib/auth-client";

const ServerOrganization = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  slug: Schema.String,
});

const ServerOrganizations = Schema.Array(ServerOrganization);

type ServerOrganization = Schema.Schema.Type<typeof ServerOrganization>;

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

  const organizations = (await response.json()) as unknown;

  if (!organizations) {
    throw new Error("Organization lookup returned no data.");
  }

  try {
    return Schema.decodeUnknownSync(ServerOrganizations)(organizations);
  } catch {
    throw new Error("Organization lookup returned an invalid payload.");
  }
});

function readServerAuthOrigin(): string | undefined {
  if (typeof __SERVER_AUTH_ORIGIN__ === "string") {
    return __SERVER_AUTH_ORIGIN__;
  }

  const authOrigin = process.env.AUTH_ORIGIN;
  return typeof authOrigin === "string" ? authOrigin : undefined;
}
